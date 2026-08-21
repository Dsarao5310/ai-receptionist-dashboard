import { AlertTriangle, CalendarClock, CalendarPlus, CalendarX, MessageCircleQuestion, PhoneCall, PhoneMissed } from "lucide-react";
import type { ActivityEventType } from "@/types";
import type { CustomerStatus } from "@/services/customers";

export const ACTIVITY_ICON: Record<ActivityEventType, typeof CalendarPlus> = {
  appointment_booked: CalendarPlus,
  appointment_rescheduled: CalendarClock,
  appointment_cancelled: CalendarX,
  call_completed: PhoneCall,
  question_answered: MessageCircleQuestion,
  conversation_escalated: AlertTriangle,
  conversation_missed: PhoneMissed,
};

export const ACTIVITY_LABEL: Record<ActivityEventType, string> = {
  appointment_booked: "Appointment booked",
  appointment_rescheduled: "Appointment rescheduled",
  appointment_cancelled: "Appointment cancelled",
  call_completed: "Call completed",
  question_answered: "Question answered",
  conversation_escalated: "Escalated to team",
  conversation_missed: "Missed call",
};

export const ACTIVITY_TONE: Record<ActivityEventType, "success" | "warning" | "danger" | "neutral" | "info"> = {
  appointment_booked: "success",
  appointment_rescheduled: "info",
  appointment_cancelled: "neutral",
  call_completed: "success",
  question_answered: "success",
  conversation_escalated: "warning",
  conversation_missed: "danger",
};

export const STATUS_LABEL: Record<CustomerStatus, string> = {
  new: "New",
  active: "Active",
  inactive: "Inactive",
};

export const STATUS_TONE: Record<CustomerStatus, "success" | "info" | "neutral"> = {
  new: "info",
  active: "success",
  inactive: "neutral",
};
