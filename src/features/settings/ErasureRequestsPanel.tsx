"use client";

import { FormEvent, useState, useTransition } from "react";
import Link from "next/link";
import { FileLock2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Input, Label } from "@/components/ui/Input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import {
  createErasureRequestAction,
  executeErasureRequestAction,
  rejectErasureRequestAction,
  verifyErasureIdentityAction,
} from "@/server/actions/privacy";
import type {
  ErasureRejectionReason,
  IdentityVerificationMethod,
  PrivacyErasureRequest,
} from "@/server/privacy/types";
import { toast } from "@/lib/store/toast";

const statusTone = {
  pending_identity: "warning",
  verified: "info",
  completed: "success",
  rejected: "neutral",
} as const;

const statusLabel = {
  pending_identity: "Identity pending",
  verified: "Ready for confirmation",
  completed: "Completed",
  rejected: "Rejected",
} as const;

export function ErasureRequestsPanel({ initialRequests }: { initialRequests: PrivacyErasureRequest[] }) {
  const [requests, setRequests] = useState(initialRequests);
  const [callId, setCallId] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const [creating, startCreating] = useTransition();

  function updateRequest(request: PrivacyErasureRequest): void {
    setRequests((current) => {
      const present = current.some((item) => item.id === request.id);
      return present
        ? current.map((item) => item.id === request.id ? request : item)
        : [request, ...current];
    });
  }

  function create(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError("");
    startCreating(async () => {
      const result = await createErasureRequestAction({ callId: callId.trim(), requestReference: reference.trim() });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      updateRequest(result.request);
      setCallId("");
      setReference("");
      toast.success("Erasure request recorded", { description: "Identity verification is still required." });
    });
  }

  return (
    <Card>
      <CardHeader className="flex-col items-start sm:flex-row sm:items-center">
        <div>
          <CardTitle>Sensitive-content erasure requests</CardTitle>
          <CardDescription>
            Track the control process without storing requester contact details or call content in the case record.
          </CardDescription>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/calls">Find a call</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        <form onSubmit={create} className="rounded-lg border border-border bg-surface-sunken p-3.5">
          <div className="flex items-start gap-3">
            <FileLock2 className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-text-primary">Record a new request</p>
              <p className="mt-0.5 text-xs text-text-muted">
                Use an internal case reference only. Do not enter a name, email, phone number, transcript, or notes.
              </p>
            </div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <div>
              <Label htmlFor="erasure-call-id">Call ID</Label>
              <Input
                id="erasure-call-id"
                value={callId}
                maxLength={100}
                placeholder="call_…"
                onChange={(event) => setCallId(event.currentTarget.value)}
              />
            </div>
            <div>
              <Label htmlFor="erasure-reference">Internal reference</Label>
              <Input
                id="erasure-reference"
                value={reference}
                maxLength={80}
                placeholder="CASE-2026-001"
                onChange={(event) => setReference(event.currentTarget.value)}
              />
            </div>
            <Button type="submit" size="sm" loading={creating} disabled={!callId.trim() || !reference.trim()}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Record
            </Button>
          </div>
          {error ? <p role="alert" className="mt-2 text-xs text-danger">{error}</p> : null}
        </form>

        <div className="space-y-2" aria-live="polite">
          {requests.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-text-muted">
              No erasure requests have been recorded for this workspace.
            </p>
          ) : requests.map((request) => (
            <ErasureRequestRow key={request.id} request={request} onUpdated={updateRequest} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ErasureRequestRow({ request, onUpdated }: {
  request: PrivacyErasureRequest;
  onUpdated: (request: PrivacyErasureRequest) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border px-3.5 py-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium text-text-primary">{request.requestReference}</p>
          <Badge tone={statusTone[request.status]}>{statusLabel[request.status]}</Badge>
        </div>
        <p className="mt-1 truncate font-mono text-xs text-text-muted">{request.callId}</p>
        <p className="mt-1 text-xs text-text-muted">Recorded {formatUtc(request.createdAt)}</p>
      </div>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        {request.status === "pending_identity" ? (
          <>
            <VerifyIdentityDialog request={request} onUpdated={onUpdated} />
            <RejectRequestDialog request={request} onUpdated={onUpdated} />
          </>
        ) : null}
        {request.status === "verified" ? (
          <>
            <ExecuteErasureDialog request={request} onUpdated={onUpdated} />
            <RejectRequestDialog request={request} onUpdated={onUpdated} />
          </>
        ) : null}
      </div>
    </div>
  );
}

function VerifyIdentityDialog({ request, onUpdated }: DialogRequestProps) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<IdentityVerificationMethod>("callback_to_record");
  const [attested, setAttested] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function changeOpen(next: boolean): void {
    setOpen(next);
    if (!next) {
      setAttested(false);
      setError("");
    }
  }

  function submit(): void {
    setError("");
    startTransition(async () => {
      const result = await verifyErasureIdentityAction({ requestId: request.id, method });
      if (!result.ok) return setError(result.error);
      onUpdated(result.request);
      changeOpen(false);
      toast.success("Identity check recorded", { description: "The request now requires destructive confirmation." });
    });
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Record identity check
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a completed identity check</DialogTitle>
          <DialogDescription>
            This dashboard does not verify identity. Record this only after completing the selected method using trusted information already on file.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div>
            <Label htmlFor={`identity-method-${request.id}`}>Completed method</Label>
            <Select value={method} onValueChange={(value) => setMethod(value as IdentityVerificationMethod)}>
              <SelectTrigger id={`identity-method-${request.id}`}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="callback_to_record">Callback to number already on file</SelectItem>
                <SelectItem value="matched_account_record">Matched existing account record</SelectItem>
                <SelectItem value="in_person">Verified in person</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-start gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
              checked={attested}
              onChange={(event) => setAttested(event.currentTarget.checked)}
            />
            I completed this check outside the dashboard. This checkbox is an operator attestation, not identity proof.
          </label>
          {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => changeOpen(false)}>Cancel</Button>
          <Button size="sm" onClick={submit} loading={pending} disabled={!attested}>Record completed check</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RejectRequestDialog({ request, onUpdated }: DialogRequestProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ErasureRejectionReason>("identity_unverified");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function changeOpen(next: boolean): void {
    setOpen(next);
    if (!next) setError("");
  }

  function submit(): void {
    setError("");
    startTransition(async () => {
      const result = await rejectErasureRequestAction({ requestId: request.id, reason });
      if (!result.ok) return setError(result.error);
      onUpdated(result.request);
      changeOpen(false);
      toast.success("Erasure request rejected");
    });
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>Reject</Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject erasure request?</DialogTitle>
          <DialogDescription>No call content will be erased. The constrained reason and actor are retained for audit.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Label htmlFor={`rejection-reason-${request.id}`}>Reason</Label>
          <Select value={reason} onValueChange={(value) => setReason(value as ErasureRejectionReason)}>
            <SelectTrigger id={`rejection-reason-${request.id}`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="identity_unverified">Identity could not be verified</SelectItem>
              <SelectItem value="request_withdrawn">Request was withdrawn</SelectItem>
              <SelectItem value="not_applicable">Request is not applicable</SelectItem>
            </SelectContent>
          </Select>
          {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => changeOpen(false)}>Cancel</Button>
          <Button variant="danger" size="sm" onClick={submit} loading={pending}>Reject request</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExecuteErasureDialog({ request, onUpdated }: DialogRequestProps) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const expected = `ERASE ${request.id}`;

  function changeOpen(next: boolean): void {
    setOpen(next);
    if (!next) {
      setConfirmation("");
      setError("");
    }
  }

  function submit(): void {
    setError("");
    startTransition(async () => {
      const result = await executeErasureRequestAction({ requestId: request.id, confirmation });
      if (!result.ok) return setError(result.error);
      onUpdated(result.request);
      changeOpen(false);
      toast.success("Sensitive content erased", { description: "The operational call record and audit evidence were preserved." });
    });
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Erase content
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Erase sensitive call content?</DialogTitle>
          <DialogDescription>
            This permanently removes transcript messages, summary, preview, and any recording locator. The operational call record and audit evidence remain.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div>
            <Label htmlFor={`erasure-confirmation-${request.id}`}>Type the exact confirmation</Label>
            <code className="mb-2 block rounded-md bg-surface-sunken px-2.5 py-2 text-xs text-text-secondary">{expected}</code>
            <Input
              id={`erasure-confirmation-${request.id}`}
              value={confirmation}
              autoComplete="off"
              onChange={(event) => setConfirmation(event.currentTarget.value)}
            />
          </div>
          <p className="text-xs text-text-muted">This phrase confirms deletion; it is not identity verification or reauthentication.</p>
          {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => changeOpen(false)}>Cancel</Button>
          <Button variant="danger" size="sm" onClick={submit} loading={pending} disabled={confirmation !== expected}>
            Permanently erase content
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface DialogRequestProps {
  request: PrivacyErasureRequest;
  onUpdated: (request: PrivacyErasureRequest) => void;
}

function formatUtc(value: string): string {
  return new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value)) + " UTC";
}
