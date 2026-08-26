import Link from "next/link";
import { Bot, Phone, MessageSquare, Mail, Calendar } from "lucide-react";
import type { ReceptionistStatus } from "@/types";
import { Card } from "@/components/ui/Card";
import { CONNECTION_STATE_STYLES as STATE_STYLES } from "@/data/constants";
import { cn } from "@/lib/utils";

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
        <Link
          href="/ai-receptionist"
          className="-my-1 -ml-1 flex items-center gap-2.5 rounded-lg py-1 pl-1 pr-4 border-r border-border transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
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
        </Link>

        {/* Same destination the readiness gauge's own channel breakdown
            already drills down to — this strip shows the identical
            Voice/SMS/Email/Calendar list, even more prominently, so it
            should behave the same way rather than being the one static
            copy of this information on the page. */}
        {ROWS.map((row) => {
          const state = status[row.key];
          const style = STATE_STYLES[state];
          return (
            <Link
              key={row.key}
              href="/connections"
              className="-my-1 flex items-center gap-2 rounded-lg px-1 py-1 transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <row.icon className="h-4 w-4 text-text-muted" />
              <span className="text-sm text-text-secondary">{row.label}</span>
              <span className={cn("flex items-center gap-1.5 text-xs font-medium", style.text)}>
                <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} />
                {style.label}
              </span>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
