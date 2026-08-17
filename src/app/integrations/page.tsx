import { Plug } from "lucide-react";
import { PagePlaceholder } from "@/components/shared/PagePlaceholder";

export default function IntegrationsPage() {
  return (
    <PagePlaceholder
      icon={Plug}
      title="Integrations"
      description="Connection cards for Vapi, Google Calendar, Gmail, Twilio, Pinecone, and n8n are coming in a later build phase."
    />
  );
}
