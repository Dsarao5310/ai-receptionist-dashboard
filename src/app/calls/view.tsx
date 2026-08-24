"use client";

import { useState } from "react";
import type { Call, ConversationOutcome, Intent } from "@/types";
import { useCallsData } from "@/features/calls/useCallsData";
import { CallsFilters } from "@/features/calls/CallsFilters";
import { CallsTable, CallsTableSkeleton } from "@/features/calls/CallsTable";
import { CallDrawer } from "@/features/calls/CallDrawer";
import { Card } from "@/components/ui/Card";
import { Pagination } from "@/components/ui/Pagination";
import { ErrorState } from "@/components/ui/ErrorState";


export default function CallsView({ initial }: { initial: { intent: Intent | "all"; outcome: ConversationOutcome | "all" } }) {

  // Analytics drill-downs arrive as "/calls?outcome=missed".
  const {
    dataset,
    loading,
    error,
    retry,
    search,
    setSearch,
    intent,
    setIntent,
    outcome,
    setOutcome,
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
  } = useCallsData(initial);

  const [selected, setSelected] = useState<Call | null>(null);

  if (error) {
    return (
      <div className="p-4 md:p-6">
        <Card>
          <ErrorState title="Couldn't load calls" description="We could not load this from the server. Your data is safe — try again." onRetry={retry} />
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <CallsFilters
        search={search}
        onSearch={setSearch}
        intent={intent}
        onIntent={setIntent}
        outcome={outcome}
        onOutcome={setOutcome}
        rangeKey={rangeKey}
        customBounds={customBounds}
        onRange={setRange}
      />

      <Card className="overflow-hidden">
        {loading || !dataset ? (
          <CallsTableSkeleton />
        ) : (
          <>
            <CallsTable calls={items} dataset={dataset} onSelect={setSelected} sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
            {total > 0 && <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />}
          </>
        )}
      </Card>

      <CallDrawer call={selected} dataset={dataset} open={!!selected} onOpenChange={(v) => !v && setSelected(null)} />
    </div>
  );
}
