import { cn } from "@/lib/utils";

/**
 * A compact trend line.
 *
 * `width`/`height` define the SVG coordinate space only — the rendered size
 * comes from CSS, so the sparkline stretches to whatever column it is given
 * instead of forcing its container wider.
 *
 * The default sizing is a full-width strip: KPI tiles now place the sparkline
 * on its own row rather than beside the label, so it no longer has to survive
 * being squeezed into ~44px next to wrapping text.
 */
export function Sparkline({
  values,
  width = 120,
  height = 32,
  tone = "accent",
  className,
}: {
  values: number[];
  width?: number;
  height?: number;
  tone?: "accent" | "success" | "danger" | "muted";
  className?: string;
}) {
  const sizing = cn("h-8 w-full min-w-0", className);
  if (values.length < 2) return <svg className={sizing} aria-hidden />;

  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);

  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  });

  const areaPoints = `0,${height} ${points.join(" ")} ${width},${height}`;
  const strokeColor = {
    accent: "var(--color-accent)",
    success: "var(--color-success)",
    danger: "var(--color-danger)",
    muted: "var(--color-text-muted)",
  }[tone];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={sizing} aria-hidden>
      <polygon points={areaPoints} fill={strokeColor} opacity={0.12} />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={strokeColor}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
