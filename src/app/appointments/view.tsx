"use client";

import { useState } from "react";
import type { AppointmentSource, AppointmentStatus } from "@/types";
import { useAppointmentsData } from "@/features/appointments/useAppointmentsData";
import { AppointmentsFilters } from "@/features/appointments/AppointmentsFilters";
import { AppointmentsTable, AppointmentsTableSkeleton } from "@/features/appointments/AppointmentsTable";
import { AppointmentsCalendar } from "@/features/appointments/calendar/AppointmentsCalendar";
import { AppointmentDrawer } from "@/features/appointments/AppointmentDrawer";
import { Card } from "@/components/ui/Card";
import { Pagination } from "@/components/ui/Pagination";
import { ErrorState } from "@/components/ui/ErrorState";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";


export default function AppointmentsView({ initial }: { initial: { status: AppointmentStatus | "all"; source: AppointmentSource | "all" } }) {

  // Analytics drill-downs arrive as "/appointments?status=cancelled".
  const {
    dataset,
    loading,
    error,
    retry,
    search,
    setSearch,
    status,
    setStatus,
    source,
    setSource,
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
    allFiltered,
    now,
  } = useAppointmentsData(initial);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "calendar">("list");

  if (error) {
    return (
      <div className="p-4 md:p-6">
        <Card>
          <ErrorState title="Couldn't load appointments" description="Something went wrong generating your demo data." onRetry={retry} />
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <Tabs value={view} onValueChange={(v) => setView(v as "list" | "calendar")}>
        <TabsList>
          <TabsTrigger value="list">List</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
        </TabsList>

        <div className="mt-4">
          <AppointmentsFilters
            search={search}
            onSearch={setSearch}
            status={status}
            onStatus={setStatus}
            source={source}
            onSource={setSource}
            rangeKey={rangeKey}
            customBounds={customBounds}
            onRange={setRange}
          />
        </div>

        <TabsContent value="list">
          <Card className="overflow-hidden">
            {loading ? (
              <AppointmentsTableSkeleton />
            ) : (
              <>
                <AppointmentsTable appointments={items} onSelect={setSelectedId} sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                {total > 0 && <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />}
              </>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="calendar">
          {loading || !now ? (
            <Card className="p-6">
              <AppointmentsTableSkeleton />
            </Card>
          ) : (
            <AppointmentsCalendar appointments={allFiltered} now={now} onSelect={setSelectedId} />
          )}
        </TabsContent>
      </Tabs>

      <AppointmentDrawer appointmentId={selectedId} dataset={dataset} open={!!selectedId} onOpenChange={(v) => !v && setSelectedId(null)} />
    </div>
  );
}
