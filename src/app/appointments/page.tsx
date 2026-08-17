import { CalendarDays } from "lucide-react";
import { PagePlaceholder } from "@/components/shared/PagePlaceholder";

export default function AppointmentsPage() {
  return (
    <PagePlaceholder
      icon={CalendarDays}
      title="Appointments"
      description="List and calendar views with editable, demo-functional reschedule and cancel actions are coming in the next build phase."
    />
  );
}
