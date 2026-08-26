"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

type Tone = "accent" | "success" | "danger" | "muted" | "hero";

/** A Catmull-Rom spline through `pts`, converted to cubic-Bezier SVG commands. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 3) {
    return `M${pts.map((p) => `${p.x},${p.y}`).join(" L")}`;
  }
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  return d;
}

const TONE_COLOR: Record<Tone, string> = {
  accent: "var(--color-accent)",
  success: "var(--color-success)",
  danger: "var(--color-danger)",
  muted: "var(--color-text-muted)",
  // For bars drawn on a solid --color-hero fill, where the surface tokens
  // above would have no contrast against their own background.
  hero: "var(--color-hero-text)",
};

/**
 * A compact per-metric trend, as a line or as bars.
 *
 * `width`/`height` define the SVG coordinate space only — the rendered size
 * comes from CSS, so the sparkline stretches to whatever column it is given
 * instead of forcing its container wider.
 *
 * ── Why two variants exist ───────────────────────────────────────────────────
 * `variant="line"` — a smoothed curve (`smoothPath()`, a lightweight
 * Catmull-Rom-to-Bezier spline) with a gradient fill underneath — is what
 * `KPICard` uses: real product research (see `.claude/skills/lessons-learned`)
 * points at a line/area chart, not bars, for a single metric's trend over
 * time; bars are the right mark for comparing discrete categories, which a
 * KPI's own history isn't. `variant="bars"` remains available for a future
 * discrete-period use (each period as its own mark, most recent at full
 * strength, older ones faded) where that comparison is actually the point.
 */
export function Sparkline({
  values,
  width = 120,
  height = 32,
  tone = "accent",
  variant = "line",
  className,
}: {
  values: number[];
  width?: number;
  height?: number;
  tone?: Tone;
  variant?: "line" | "bars";
  className?: string;
}) {
  const gradientId = useId();
  const sizing = cn("h-8 w-full min-w-0 overflow-visible", className);
  const stroke = TONE_COLOR[tone];

  if (values.length < 2) return <svg className={sizing} aria-hidden />;

  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  if (variant === "bars") {
    const gap = width * 0.018;
    const barWidth = (width - gap * (values.length - 1)) / values.length;
    return (
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={sizing} aria-hidden>
        {values.map((v, i) => {
          const h = Math.max(((v - min) / range) * (height - 4), 2);
          const x = i * (barWidth + gap);
          const y = height - h;
          const isLast = i === values.length - 1;
          // Capped by the bar's own height, not just its width. A
          // near-zero value is floored to a 2px-tall bar so it stays
          // visible at all — but a fixed ~2.5px radius on a 2px-tall bar
          // exceeds half its height, which rounds it past "a short bar"
          // into a small circle. A sparse period like Today, where most
          // buckets are genuinely zero, turned into a row of dots instead
          // of a row of short bars.
          const radius = Math.min(barWidth / 2.4, h / 2, 2.5);
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={barWidth}
              height={h}
              rx={radius}
              fill={stroke}
              opacity={isLast ? 1 : 0.28}
            />
          );
        })}
      </svg>
    );
  }

  const stepX = width / (values.length - 1);
  const pts = values.map((v, i) => ({
    x: i * stepX,
    y: height - ((v - min) / range) * (height - 6) - 3,
  }));

  // A smooth Catmull-Rom-to-Bezier curve reads as a real trend line rather
  // than a jagged connect-the-dots — the same technique a proper chart
  // library uses for a "monotone" curve, kept lightweight here because a
  // sparkline is only ever a handful of points.
  const linePath = smoothPath(pts);
  const area = `M0,${height} L${pts[0].x},${pts[0].y} ${linePath.replace(/^M[^ ]+ /, "")} L${width},${height} Z`;
  const last = pts[pts.length - 1];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={sizing} aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.32} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* preserveAspectRatio="none" scales x and y unevenly, so a circle would
          render as an ellipse. A non-scaling stroke on a zero-length line
          draws a true round cap at the point instead. */}
      <line
        x1={last.x}
        y1={last.y}
        x2={last.x}
        y2={last.y}
        stroke={stroke}
        strokeWidth={4}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
