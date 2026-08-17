import { LayoutDashboard } from "lucide-react";
import { PagePlaceholder } from "@/components/shared/PagePlaceholder";

export default function OverviewPage() {
  return (
    <PagePlaceholder
      icon={LayoutDashboard}
      title="Overview"
      description="KPIs, activity feed, trend charts, and upcoming appointments land here in the next build phase — the application shell, theming, and navigation you see now are fully wired up."
    />
  );
}
