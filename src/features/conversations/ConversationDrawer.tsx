"use client";

import { Bot, User, CheckCircle2, Circle } from "lucide-react";
import type { Conversation } from "@/types";
import { Drawer, DrawerBody, DrawerClose, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/Drawer";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { CHANNEL_LABELS, INTENT_LABELS, OUTCOME_LABELS } from "@/data/constants";
import { formatDuration } from "@/lib/utils";
import { CHANNEL_ICONS, OUTCOME_TONE } from "./shared";
import { useBusinessFormat } from "@/lib/business-format";

export function ConversationDrawer({
  conversation,
  open,
  onOpenChange,
}: {
  conversation: Conversation | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  // Timestamps are rendered on the business's clock, not the viewer's.
  const fmt = useBusinessFormat();
  if (!conversation) return null;
  const ChannelIcon = CHANNEL_ICONS[conversation.channel];

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <div className="flex items-center gap-3 min-w-0">
            <Avatar name={conversation.customerName} />
            <div className="min-w-0">
              <DrawerTitle className="truncate">{conversation.customerName}</DrawerTitle>
              <DrawerDescription className="flex items-center gap-1.5">
                <ChannelIcon className="h-3.5 w-3.5" />
                {CHANNEL_LABELS[conversation.channel]} · {fmt.dateTime(conversation.timestamp)}
                {conversation.durationSec ? ` · ${formatDuration(conversation.durationSec)}` : ""}
              </DrawerDescription>
            </div>
          </div>
          <DrawerClose />
        </DrawerHeader>
        <DrawerBody className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">{INTENT_LABELS[conversation.intent]}</Badge>
            <Badge tone={OUTCOME_TONE[conversation.outcome]}>{OUTCOME_LABELS[conversation.outcome]}</Badge>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-1.5">Summary</p>
            <p className="text-sm text-text-primary">{conversation.summary}</p>
          </div>

          {conversation.bookingAction && (
            <div className="rounded-lg border border-border bg-surface-sunken px-3.5 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-1">Booking action</p>
              <p className="text-sm text-text-primary">{conversation.bookingAction}</p>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">What the AI did</p>
            <ul className="space-y-1.5">
              {conversation.actions.map((step) => (
                <li key={step.label} className="flex items-center gap-2 text-sm">
                  {step.done ? (
                    <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                  ) : (
                    <Circle className="h-4 w-4 text-text-muted shrink-0" />
                  )}
                  <span className={step.done ? "text-text-primary" : "text-text-muted"}>{step.label}</span>
                </li>
              ))}
            </ul>
          </div>

          {conversation.channel === "voice" && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">Recording</p>
              <div className="flex items-center gap-3 rounded-lg border border-dashed border-border-strong px-3.5 py-3 text-xs text-text-muted">
                Recording playback will appear here once Voice is connected to a live provider.
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">Transcript</p>
            {conversation.outcome === "missed" ? (
              <p className="text-sm text-text-muted italic">No transcript — the call wasn&apos;t answered.</p>
            ) : (
              <div className="space-y-3">
                {conversation.transcript.map((line, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <span
                      className={
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full " +
                        (line.speaker === "ai" ? "bg-accent-subtle text-accent-text" : "bg-surface-sunken text-text-secondary")
                      }
                    >
                      {line.speaker === "ai" ? <Bot className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-text-primary">{line.text}</p>
                      <p className="text-[11px] text-text-muted mt-0.5">{line.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
