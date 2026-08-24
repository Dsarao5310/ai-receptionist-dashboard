import { cn } from "@/lib/utils";
import { initials } from "@/lib/utils";

/**
 * Identity tints, expressed through the theme's own semantic colors.
 *
 * These were previously six hardcoded light-mode hex pairs, which meant a row
 * of avatars stayed as bright pastel chips on the near-black dark surface —
 * legible, but visibly outside the system. Each entry now pairs a `*-bg` token
 * with its matching foreground token, so both themes recolor automatically.
 */
const PALETTE = [
  "bg-info-bg text-info",
  "bg-accent-subtle text-accent-text",
  "bg-success-bg text-success",
  "bg-warning-bg text-warning",
  "bg-danger-bg text-danger",
  "bg-surface-sunken text-text-secondary",
];

function paletteFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeClasses = { sm: "h-7 w-7 text-[11px]", md: "h-9 w-9 text-xs", lg: "h-12 w-12 text-sm" }[size];
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full font-semibold shrink-0",
        sizeClasses,
        paletteFor(name),
        className
      )}
      aria-hidden
    >
      {initials(name)}
    </div>
  );
}
