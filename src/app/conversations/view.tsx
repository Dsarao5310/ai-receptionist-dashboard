"use client";

import { useState } from "react";
import type { Channel, Conversation, ConversationOutcome, Intent } from "@/types";
import { useConversationsData } from "@/features/conversations/useConversationsData";
import { ConversationsFilters } from "@/features/conversations/ConversationsFilters";
import { ConversationsTable, ConversationsTableSkeleton } from "@/features/conversations/ConversationsTable";
import { ConversationDrawer } from "@/features/conversations/ConversationDrawer";
import { Card } from "@/components/ui/Card";
import { Pagination } from "@/components/ui/Pagination";
import { ErrorState } from "@/components/ui/ErrorState";


export default function ConversationsView({ initial }: { initial: { channel: Channel | "all"; intent: Intent | "all"; outcome: ConversationOutcome | "all" } }) {

  // Analytics drill-downs arrive as "/conversations?intent=booking&outcome=booked".
  const {
    loading,
    error,
    retry,
    search,
    setSearch,
    channel,
    setChannel,
    intent,
    setIntent,
    outcome,
    setOutcome,
    bookingStatus,
    setBookingStatus,
    rangeKey,
    customBounds,
    setRange,
    sortBy,
    sortDir,
    toggleSort,
    page,
    setPage,
    pageSize,
    items,
    total,
  } = useConversationsData(initial);

  const [selected, setSelected] = useState<Conversation | null>(null);

  if (error) {
    return (
      <div className="p-4 md:p-6">
        <Card>
          <ErrorState title="Couldn't load conversations" description="We could not load this from the server. Your data is safe — try again." onRetry={retry} />
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <ConversationsFilters
        search={search}
        onSearch={setSearch}
        channel={channel}
        onChannel={setChannel}
        intent={intent}
        onIntent={setIntent}
        outcome={outcome}
        onOutcome={setOutcome}
        bookingStatus={bookingStatus}
        onBookingStatus={setBookingStatus}
        rangeKey={rangeKey}
        customBounds={customBounds}
        onRange={setRange}
      />

      <Card className="overflow-hidden">
        {loading ? (
          <ConversationsTableSkeleton />
        ) : (
          <>
            <ConversationsTable conversations={items} onSelect={setSelected} sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
            {total > 0 && <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />}
          </>
        )}
      </Card>

      <ConversationDrawer conversation={selected} open={!!selected} onOpenChange={(v) => !v && setSelected(null)} />
    </div>
  );
}
