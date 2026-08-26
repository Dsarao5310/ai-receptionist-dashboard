"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCustomersData } from "@/features/customers/useCustomersData";
import { CustomersFilters } from "@/features/customers/CustomersFilters";
import { CustomersTable, CustomersTableSkeleton } from "@/features/customers/CustomersTable";
import { CustomerDrawer } from "@/features/customers/CustomerDrawer";
import { AppointmentDrawer } from "@/features/appointments/AppointmentDrawer";
import { ConversationDrawer } from "@/features/conversations/ConversationDrawer";
import { CallDrawer } from "@/features/calls/CallDrawer";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card } from "@/components/ui/Card";
import { Pagination } from "@/components/ui/Pagination";
import { ErrorState } from "@/components/ui/ErrorState";

export default function CustomersView({ openCustomerId }: { openCustomerId: string | null }) {
  const router = useRouter();

  const { dataset, now, loading, error, retry, search, setSearch, status, setStatus, channel, setChannel, sortBy, sortDir, toggleSort, page, setPage, pageSize, items, total } =
    useCustomersData();

  // Deep-linked from another page (e.g. "/customers?open=cust_12"): seed initial state
  // directly from the URL so the drawer opens on first paint once the shared dataset is ready.
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(openCustomerId);
  const [customerDrawerOpen, setCustomerDrawerOpen] = useState<boolean>(openCustomerId !== null);
  const [relatedAppointmentId, setRelatedAppointmentId] = useState<string | null>(null);
  const [relatedConversationId, setRelatedConversationId] = useState<string | null>(null);
  const [relatedCallId, setRelatedCallId] = useState<string | null>(null);

  const cleanedDeepLink = useRef(false);

  useEffect(() => {
    if (cleanedDeepLink.current || !openCustomerId) return;
    cleanedDeepLink.current = true;
    router.replace("/customers");
  }, [openCustomerId, router]);

  // The drawer is opened from state rather than a Radix trigger, so Radix has no element to
  // restore focus to on close. Remember the row that opened it and hand focus back ourselves.
  const returnFocusTo = useRef<HTMLElement | null>(null);

  function openCustomer(id: string) {
    returnFocusTo.current = document.activeElement as HTMLElement | null;
    setSelectedCustomerId(id);
    setCustomerDrawerOpen(true);
  }

  function closeCustomerDrawer(open: boolean) {
    setCustomerDrawerOpen(open);
    if (!open) returnFocusTo.current?.focus();
  }

  function backToCustomer() {
    if (selectedCustomerId) setCustomerDrawerOpen(true);
  }

  function openAppointment(id: string) {
    setCustomerDrawerOpen(false);
    setRelatedAppointmentId(id);
  }
  function openConversation(id: string) {
    setCustomerDrawerOpen(false);
    setRelatedConversationId(id);
  }
  function openCall(id: string) {
    setCustomerDrawerOpen(false);
    setRelatedCallId(id);
  }

  const relatedConversation = relatedConversationId ? dataset?.conversations.find((c) => c.id === relatedConversationId) ?? null : null;
  const relatedCall = relatedCallId ? dataset?.calls.find((c) => c.id === relatedCallId) ?? null : null;

  if (error) {
    return (
      <div>
        <Card>
          <ErrorState title="Couldn't load customers" description="We could not load this from the server. Your data is safe — try again." onRetry={retry} />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader description="Everyone who has called, texted, or emailed your business, and what's next for them." />

      <CustomersFilters search={search} onSearch={setSearch} status={status} onStatus={setStatus} channel={channel} onChannel={setChannel} />

      <Card className="overflow-hidden">
        {loading ? (
          <CustomersTableSkeleton />
        ) : (
          <>
            <CustomersTable
              customers={items}
              onSelect={openCustomer}
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={toggleSort}
              filtered={search.trim().length > 0 || status !== "all" || channel !== "all"}
            />
            {total > 0 && <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />}
          </>
        )}
      </Card>

      <CustomerDrawer
        customerId={selectedCustomerId}
        dataset={dataset}
        now={now}
        open={customerDrawerOpen}
        onOpenChange={closeCustomerDrawer}
        onOpenAppointment={openAppointment}
        onOpenConversation={openConversation}
        onOpenCall={openCall}
      />

      <AppointmentDrawer
        appointmentId={relatedAppointmentId}
        dataset={dataset}
        open={!!relatedAppointmentId}
        onOpenChange={(v) => {
          if (!v) {
            setRelatedAppointmentId(null);
            backToCustomer();
          }
        }}
      />

      <ConversationDrawer
        conversation={relatedConversation}
        open={!!relatedConversation}
        onOpenChange={(v) => {
          if (!v) {
            setRelatedConversationId(null);
            backToCustomer();
          }
        }}
      />

      <CallDrawer
        call={relatedCall}
        dataset={dataset}
        open={!!relatedCall}
        onOpenChange={(v) => {
          if (!v) {
            setRelatedCallId(null);
            backToCustomer();
          }
        }}
      />
    </div>
  );
}
