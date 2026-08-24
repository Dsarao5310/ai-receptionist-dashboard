"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

type Tone = "accent" | "success" | "danger" | "muted";

const TONE_COLOR: Record<Tone, string> = {
  accent: "var(--color-accent)",
  success: "var(--color-success)",
  danger: "var(--color-danger)",
  muted: "var(--color-text-muted)",
};

/**
 * A compact per-metric trend, as a line or as bars.
 *
 * `width`/`height` define the SVG coordinate space only — the rendered size
 * comes from CSS, so the sparkline stretches to whatever column it is given
 * instead of forcing its container wider.
 *
 * ── Why two variants exist ───────────────────────────────────────────────────
 * A translucent line with nothing else in the card reads as decoration rather
 * than data — the shape is too faint to say anything on its own. `variant="bars"`
 * is the one KPI tiles use: each period gets its own mark, and the most recent
 * one is drawn at full strength so the eye lands on "where we are now" instead
 * of a vague fading curve. `variant="line"` stays for places (the chart legend,
 * for instance) where a continuous trend reads better than discrete periods.
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
    const radius = Math.min(barWidth / 2.4, 2.5);
    return (
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={sizing} aria-hidden>
        {values.map((v, i) => {
          const h = Math.max(((v - min) / range) * (height - 4), 2);
          const x = i * (barWidth + gap);
          const y = height - h;
          const isLast = i === values.length - 1;
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

  const line = pts.map((p) => `${p.x},${p.y}`).join(" ");
  const area = `0,${height} ${line} ${width},${height}`;
  const last = pts[pts.length - 1];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={sizing} aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradientId})`} />
      <polyline
        points={line}
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
