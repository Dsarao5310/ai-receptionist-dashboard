import { Users } from "lucide-react";
import { PagePlaceholder } from "@/components/shared/PagePlaceholder";

export default function CustomersPage() {
  return (
    <PagePlaceholder
      icon={Users}
      title="Customers"
      description="Customer directory with contact info, appointment history, and interaction timelines is coming in the next build phase."
    />
  );
}
