"use client";

import type { Conversation } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonRow } from "@/components/ui/Skeleton";
import { INTENT_LABELS, OUTCOME_LABELS } from "@/data/constants";
import { CHANNEL_ICONS, OUTCOME_TONE } from "@/features/conversations/shared";

import { useBusinessFormat } from "@/lib/business-format";

export function RecentConversations({ conversations, onSelect }: { conversations: Conversation[]; onSelect: (c: Conversation) => void }) {
  // Timestamps are rendered on the business's clock, not the viewer's.
  const fmt = useBusinessFormat();
  return (
    <Card className="rounded-2xl card-raised">
      <CardHeader>
        <CardTitle className="text-section">Recent conversations</CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        {conversations.length === 0 ? (
          <EmptyState title="No conversations yet" description="Voice, SMS, and email conversations will show up here." />
        ) : (
          <ul className="divide-y divide-border -mx-5">
            {conversations.map((c) => {
              const Icon = CHANNEL_ICONS[c.channel];
              return (
                <li key={c.id}>
                  <button
                    onClick={() => onSelect(c)}
                    className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-hover"
                  >
                    <Avatar name={c.customerName} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text-primary truncate">{c.customerName}</span>
                        <Icon className="h-3.5 w-3.5 text-text-muted shrink-0" />
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-text-muted">{INTENT_LABELS[c.intent]}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <Badge tone={OUTCOME_TONE[c.outcome]} className="text-[10px]">
                        {OUTCOME_LABELS[c.outcome]}
                      </Badge>
                      <span className="text-[11px] text-text-muted">{fmt.relative(c.timestamp)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function RecentConversationsSkeleton() {
  return (
    <Card className="rounded-2xl card-raised">
      <CardHeader>
        <CardTitle className="text-section">Recent conversations</CardTitle>
      </CardHeader>
      <CardContent className="pt-4 -mx-5 -my-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </CardContent>
    </Card>
  );
}
