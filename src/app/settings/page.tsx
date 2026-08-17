import { Settings } from "lucide-react";
import { PagePlaceholder } from "@/components/shared/PagePlaceholder";

export default function SettingsPage() {
  return (
    <PagePlaceholder
      icon={Settings}
      title="Settings"
      description="Account, workspace, and notification preferences are coming in a later build phase. Try the palette icon in the top bar for working appearance controls today."
    />
  );
}
