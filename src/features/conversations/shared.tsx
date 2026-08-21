import { Phone, MessageSquare, Mail } from "lucide-react";
import type { Channel, Conversation } from "@/types";

export const CHANNEL_ICONS: Record<Channel, typeof Phone> = { voice: Phone, sms: MessageSquare, email: Mail };

export const OUTCOME_TONE: Record<Conversation["outcome"], "success" | "warning" | "danger" | "neutral" | "info"> = {
  booked: "success",
  rescheduled: "info",
  cancelled: "neutral",
  answered: "success",
  escalated: "warning",
  missed: "danger",
  no_action: "neutral",
};
