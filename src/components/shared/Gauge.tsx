import { cn } from "@/lib/utils";

/**
 * A 0–100 arc with the value at its centre.
 *
 * ── Why an arc rather than a bar ────────────────────────────────────────────
 * A single composite score has no natural left-to-right reading; a bar implies
 * progress toward completion, which a health score is not. The arc reads as a
 * dial — a position within a range — which is what this actually is.
 *
 * ── Colour is never the only signal ─────────────────────────────────────────
 * The tone shifts with the score, but the number itself is always present at
 * display size and the caption states the situation in words. Someone who
 * cannot distinguish the track colour loses nothing.
 */
export function Gauge({
  value,
  label,
  caption,
  showLabel = true,
  className,
}: {
  /** Clamped to 0–100. */
  value: number;
  /** Always used as the SVG's accessible name, even when not shown visibly. */
  label: string;
  caption?: string;
  /** Set false when a surrounding CardHeader already states the title, so it is not said twice. */
  showLabel?: boolean;
  className?: string;
}) {
  const safe = Math.max(0, Math.min(100, Math.round(value)));

  // A 240° sweep starting at 150°, leaving the base open so the arc reads as a
  // dial rather than a closed ring.
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const sweep = 240 / 360;
  const trackLength = circumference * sweep;
  const filled = trackLength * (safe / 100);

  const tone =
    safe >= 80 ? "var(--color-success)" : safe >= 50 ? "var(--color-warning)" : "var(--color-danger)";

  return (
    <div className={cn("flex flex-col items-center text-center", className)}>
      <div className="relative">
        <svg
          viewBox="0 0 130 130"
          className="h-[130px] w-[130px] -rotate-[150deg]"
          role="img"
          aria-label={`${label}: ${safe} out of 100`}
        >
          <circle
            cx="65"
            cy="65"
            r={radius}
            fill="none"
            stroke="var(--color-surface-sunken)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${trackLength} ${circumference}`}
          />
          <circle
            cx="65"
            cy="65"
            r={radius}
            fill="none"
            stroke={tone}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference}`}
            style={{ transition: "stroke-dasharray 700ms ease-out" }}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-metric text-text-primary">{safe}</span>
          <span className="text-[11px] font-medium uppercase tracking-wide text-text-muted">out of 100</span>
        </div>
      </div>

      {showLabel && <p className="mt-1 text-sm font-semibold text-text-primary">{label}</p>}
      {caption && <p className={cn("max-w-[26ch] text-xs text-text-muted", showLabel ? "mt-1" : "mt-2")}>{caption}</p>}
    </div>
  );
}
