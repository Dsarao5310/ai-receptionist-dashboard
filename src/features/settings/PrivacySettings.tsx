"use client";

import { useState, useTransition } from "react";
import { Clock3, LockKeyhole, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { SaveBar, UnsavedChangesDialog } from "@/components/shared/SaveBar";
import { toast } from "@/lib/store/toast";
import { useUnsavedChanges } from "@/lib/use-unsaved-changes";
import { updatePrivacyPolicyAction } from "@/server/actions/privacy";
import type { WorkspacePrivacyPolicy } from "@/server/privacy/types";
import type { PrivacyErasureRequest } from "@/server/privacy/types";
import { ErasureRequestsPanel } from "./ErasureRequestsPanel";

interface PrivacyDraft {
  recordingMode: WorkspacePrivacyPolicy["recordingMode"];
  transcriptRetentionDays: number;
  recordingRetentionDays: number;
  consentNotice: string;
}

export function PrivacySettings({
  policy,
  automaticDeletionScheduled,
  erasureRequests,
}: {
  policy: WorkspacePrivacyPolicy;
  automaticDeletionScheduled: boolean;
  erasureRequests: PrivacyErasureRequest[];
}) {
  const [saved, setSaved] = useState(policy);
  const [draft, setDraft] = useState<PrivacyDraft>(() => toDraft(policy));
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const dirty = !sameDraft(draft, toDraft(saved));
  const noticeTooShort = draft.recordingMode === "explicit_consent" && draft.consentNotice.trim().length < 20;
  const { blocked, confirmLeave, cancelLeave } = useUnsavedChanges(dirty);

  function save(): void {
    setError("");
    startTransition(async () => {
      const result = await updatePrivacyPolicyAction(draft);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(result.policy);
      setDraft(toDraft(result.policy));
      toast.success("Privacy policy saved", { description: `Policy version ${result.policy.policyVersion} is active.` });
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatusCard
          icon={LockKeyhole}
          label="Call recording"
          value={saved.recordingMode === "disabled" ? "Disabled" : "Explicit consent"}
          tone={saved.recordingMode === "disabled" ? "neutral" : "warning"}
        />
        <StatusCard
          icon={Clock3}
          label="Automatic deletion"
          value={automaticDeletionScheduled ? "Scheduled" : "Not enabled"}
          tone={automaticDeletionScheduled ? "success" : "neutral"}
        />
        <StatusCard icon={ShieldCheck} label="Policy version" value={`Version ${saved.policyVersion}`} tone="neutral" />
      </div>

      <Card>
        <CardHeader className="flex-col items-start sm:flex-row sm:items-center">
          <CardTitle>Call privacy</CardTitle>
          <CardDescription>
            Technical controls for recordings and transcripts in this workspace. Consent wording and retention still
            need appropriate business and legal review.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-surface-sunken px-3.5 py-3">
            <div>
              <Label htmlFor="privacy-recording" className="mb-0">Allow recording after explicit consent</Label>
              <p id="privacy-recording-help" className="mt-1 text-xs text-text-secondary">
                Turning this on changes policy only. It does not connect Vapi or start recording calls.
              </p>
            </div>
            <Switch
              id="privacy-recording"
              checked={draft.recordingMode === "explicit_consent"}
              onCheckedChange={(checked) => setDraft((current) => ({
                ...current,
                recordingMode: checked ? "explicit_consent" : "disabled",
              }))}
              aria-describedby="privacy-recording-help"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="privacy-transcript-days">Transcript retention</Label>
              <div className="relative">
                <Input
                  id="privacy-transcript-days"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={365}
                  value={draft.transcriptRetentionDays}
                  onChange={(event) => {
                    const value = event.currentTarget.valueAsNumber;
                    setDraft((current) => ({
                      ...current,
                      transcriptRetentionDays: Number.isNaN(value) ? 0 : value,
                    }));
                  }}
                  aria-describedby="privacy-transcript-help"
                  className="pr-14"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted">days</span>
              </div>
              <p id="privacy-transcript-help" className="mt-1 text-xs text-text-muted">Between 1 and 365 days.</p>
            </div>

            <div>
              <Label htmlFor="privacy-recording-days">Recording retention</Label>
              <div className="relative">
                <Input
                  id="privacy-recording-days"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={90}
                  value={draft.recordingRetentionDays}
                  onChange={(event) => {
                    const value = event.currentTarget.valueAsNumber;
                    setDraft((current) => ({
                      ...current,
                      recordingRetentionDays: Number.isNaN(value) ? 0 : value,
                    }));
                  }}
                  aria-describedby="privacy-recording-days-help"
                  className="pr-14"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted">days</span>
              </div>
              <p id="privacy-recording-days-help" className="mt-1 text-xs text-text-muted">Between 1 and 90 days.</p>
            </div>
          </div>

          <div>
            <Label htmlFor="privacy-consent-notice">Consent notice</Label>
            <Textarea
              id="privacy-consent-notice"
              rows={4}
              maxLength={1000}
              value={draft.consentNotice}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setDraft((current) => ({ ...current, consentNotice: value }));
              }}
              aria-describedby="privacy-consent-help privacy-consent-count"
              aria-invalid={noticeTooShort || undefined}
            />
            <div className="mt-1 flex items-start justify-between gap-3 text-xs">
              <p id="privacy-consent-help" className={noticeTooShort ? "text-danger" : "text-text-muted"}>
                {draft.recordingMode === "explicit_consent"
                  ? "Required before recording can be enabled; use at least 20 characters."
                  : "Saved for review but not used while recording is disabled."}
              </p>
              <span id="privacy-consent-count" className="shrink-0 text-text-muted">{draft.consentNotice.length}/1000</span>
            </div>
          </div>

          <p className="text-xs text-text-muted">Last saved {formatUtc(saved.updatedAt)}.</p>
          {error ? <p role="alert" className="rounded-lg border border-danger/30 bg-danger-bg px-3.5 py-2.5 text-sm text-danger">{error}</p> : null}

          <SaveBar
            dirty={dirty}
            onSave={save}
            onCancel={() => { setDraft(toDraft(saved)); setError(""); }}
            saveLabel="Save privacy policy"
            disabled={pending || noticeTooShort || !validDays(draft)}
            loading={pending}
          />
          <UnsavedChangesDialog open={blocked} onConfirm={confirmLeave} onCancel={cancelLeave} />
        </CardContent>
      </Card>
      <ErasureRequestsPanel initialRequests={erasureRequests} />
    </div>
  );
}

function StatusCard({ icon: Icon, label, value, tone }: {
  icon: typeof ShieldCheck;
  label: string;
  value: string;
  tone: "neutral" | "success" | "warning";
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-text-muted">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-text-muted">{label}</p>
          <Badge tone={tone} className="mt-1">{value}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function toDraft(policy: WorkspacePrivacyPolicy): PrivacyDraft {
  return {
    recordingMode: policy.recordingMode,
    transcriptRetentionDays: policy.transcriptRetentionDays,
    recordingRetentionDays: policy.recordingRetentionDays,
    consentNotice: policy.consentNotice,
  };
}

function sameDraft(left: PrivacyDraft, right: PrivacyDraft): boolean {
  return left.recordingMode === right.recordingMode
    && left.transcriptRetentionDays === right.transcriptRetentionDays
    && left.recordingRetentionDays === right.recordingRetentionDays
    && left.consentNotice === right.consentNotice;
}

function validDays(draft: PrivacyDraft): boolean {
  return Number.isInteger(draft.transcriptRetentionDays)
    && draft.transcriptRetentionDays >= 1
    && draft.transcriptRetentionDays <= 365
    && Number.isInteger(draft.recordingRetentionDays)
    && draft.recordingRetentionDays >= 1
    && draft.recordingRetentionDays <= 90;
}

function formatUtc(value: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value)) + " UTC";
}
