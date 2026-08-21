import { Bot, Phone, MessageSquare, Mail, Calendar } from "lucide-react";
import type { ConnectionState, ReceptionistStatus } from "@/types";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

const STATE_STYLES: Record<ConnectionState, { dot: string; label: string; text: string }> = {
  connected: { dot: "bg-success", label: "Connected", text: "text-success" },
  needs_attention: { dot: "bg-warning", label: "Needs attention", text: "text-warning" },
  disconnected: { dot: "bg-danger", label: "Disconnected", text: "text-danger" },
};

const ROWS: { key: keyof Omit<ReceptionistStatus, "overall">; label: string; icon: typeof Bot }[] = [
  { key: "voice", label: "Voice", icon: Phone },
  { key: "sms", label: "SMS", icon: MessageSquare },
  { key: "email", label: "Email", icon: Mail },
  { key: "calendar", label: "Calendar", icon: Calendar },
];

export function StatusStrip({ status }: { status: ReceptionistStatus }) {
  const overallStyle = status.overall === "online" ? STATE_STYLES.connected : status.overall === "degraded" ? STATE_STYLES.needs_attention : STATE_STYLES.disconnected;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2.5 pr-4 border-r border-border">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-subtle text-accent-text">
            <Bot className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-text-primary leading-none">AI Receptionist</p>
            <p className={cn("mt-1 flex items-center gap-1.5 text-xs font-medium", overallStyle.text)}>
              <span className={cn("h-1.5 w-1.5 rounded-full", overallStyle.dot)} />
              {status.overall === "online" ? "Online" : status.overall === "degraded" ? "Degraded" : "Offline"}
            </p>
          </div>
        </div>

        {ROWS.map((row) => {
          const state = status[row.key];
          const style = STATE_STYLES[state];
          return (
            <div key={row.key} className="flex items-center gap-2">
              <row.icon className="h-4 w-4 text-text-muted" />
              <span className="text-sm text-text-secondary">{row.label}</span>
              <span className={cn("flex items-center gap-1.5 text-xs font-medium", style.text)}>
                <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} />
                {style.label}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
