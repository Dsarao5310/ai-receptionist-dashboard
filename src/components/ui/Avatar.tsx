import { cn } from "@/lib/utils";
import { initials } from "@/lib/utils";

const PALETTE = [
  "bg-[#e9f1fb] text-[#1e5389]",
  "bg-[#eef0fd] text-[#4338ca]",
  "bg-[#e7f5ee] text-[#12613f]",
  "bg-[#fbede0] text-[#a54a0a]",
  "bg-[#fbe9ee] text-[#a02a47]",
  "bg-[#f2f1ee] text-[#322f2b]",
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
