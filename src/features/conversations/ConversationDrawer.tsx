"use client";

import { Bot, User, CheckCircle2, Circle, Mic } from "lucide-react";
import type { Conversation } from "@/types";
import { Drawer, DrawerBody, DrawerClose, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/Drawer";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { CHANNEL_LABELS, INTENT_LABELS, OUTCOME_LABELS } from "@/data/constants";
import { cn, formatDuration } from "@/lib/utils";
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
            <Avatar name={conversation.customerName} size="lg" />
            <div className="min-w-0">
              <DrawerTitle className="truncate">{conversation.customerName}</DrawerTitle>
              <DrawerDescription>
                {fmt.dateTime(conversation.timestamp)}
                {conversation.durationSec ? ` · ${formatDuration(conversation.durationSec)}` : ""}
              </DrawerDescription>
            </div>
          </div>
          <DrawerClose />
        </DrawerHeader>
        <DrawerBody className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">
              <ChannelIcon className="h-3 w-3" />
              {CHANNEL_LABELS[conversation.channel]}
            </Badge>
            <Badge tone="accent">{INTENT_LABELS[conversation.intent]}</Badge>
            <Badge tone={OUTCOME_TONE[conversation.outcome]} dot>
              {OUTCOME_LABELS[conversation.outcome]}
            </Badge>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-1.5">Summary</p>
            <p className="text-sm text-text-primary leading-relaxed">{conversation.summary}</p>
          </div>

          <div className="border-t border-border pt-6">
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
            <div className="border-t border-border pt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">Recording</p>
              <div className="flex items-center gap-3 rounded-lg border border-dashed border-border-strong px-3.5 py-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-text-muted">
                  <Mic className="h-4 w-4" />
                </span>
                <p className="text-xs text-text-muted">Recording playback will appear here once Voice is connected to a live provider.</p>
              </div>
            </div>
          )}

          <div className="border-t border-border pt-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-3">Transcript</p>
            {conversation.outcome === "missed" ? (
              <p className="text-sm text-text-muted italic">No transcript — the call wasn&apos;t answered.</p>
            ) : (
              <div className="space-y-3">
                {conversation.transcript.map((line, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                        line.speaker === "ai" ? "bg-accent-subtle text-accent-text" : "bg-surface-sunken text-text-secondary"
                      )}
                    >
                      {line.speaker === "ai" ? <Bot className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div
                        className={cn(
                          "rounded-lg px-3 py-2 text-sm text-text-primary",
                          line.speaker === "ai" ? "bg-accent-subtle" : "bg-surface-sunken"
                        )}
                      >
                        {line.text}
                      </div>
                      <p className="text-[11px] text-text-muted mt-1">{line.time}</p>
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
