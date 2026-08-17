import { MessagesSquare } from "lucide-react";
import { PagePlaceholder } from "@/components/shared/PagePlaceholder";

export default function ConversationsPage() {
  return (
    <PagePlaceholder
      icon={MessagesSquare}
      title="Conversations"
      description="A unified inbox across Voice, SMS, and Email with search, filters, and a detail drawer is coming in the next build phase."
    />
  );
}
