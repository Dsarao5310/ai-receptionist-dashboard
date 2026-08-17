import type { LucideIcon } from "lucide-react";
import { Construction } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

export function PagePlaceholder({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="p-4 md:p-6">
      <div className="rounded-xl border border-dashed border-border-strong bg-surface">
        <EmptyState
          icon={icon ?? Construction}
          title={`${title} — coming up next`}
          description={description}
        />
      </div>
    </div>
  );
}
