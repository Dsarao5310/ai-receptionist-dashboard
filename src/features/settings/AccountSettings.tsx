"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { Avatar } from "@/components/ui/Avatar";
import { SaveBar, UnsavedChangesDialog } from "@/components/shared/SaveBar";
import { useUnsavedChanges } from "@/lib/use-unsaved-changes";
import { useSettings } from "@/lib/store/settings";
import { toast } from "@/lib/store/toast";

/**
 * A batched form, following the established rule: several related fields edited
 * together get Save/Discard and a dirty-state guard. Single toggles elsewhere
 * save immediately.
 */
export function AccountSettings() {
  const { account, setAccount } = useSettings();
  const [draft, setDraft] = useState(account);

  // React's adjust-state-during-render pattern: if the store changes underneath
  // (a reset, another tab), the draft follows without an effect.
  const [syncedFrom, setSyncedFrom] = useState(account);
  if (account !== syncedFrom) {
    setSyncedFrom(account);
    setDraft(account);
  }

  const dirty =
    draft.name !== account.name || draft.email !== account.email || draft.jobTitle !== account.jobTitle;
  // The hook's return value is not optional: it intercepts in-app link clicks
  // while the form is dirty and parks the destination. Dropping it left every
  // navigation cancelled with nothing shown — the link simply did nothing.
  const { blocked, confirmLeave, cancelLeave } = useUnsavedChanges(dirty);

  function save() {
    setAccount(draft);
    toast.success("Account details saved");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
        <CardDescription>How you appear inside this workspace.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Avatar name={draft.name || "?"} size="lg" />
          <div>
            <p className="text-sm text-text-primary">{draft.name || "Unnamed"}</p>
            <p className="text-xs text-text-muted">
              Initials are shown here. Uploading a photo is not available yet.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="account-name">Name</Label>
            <Input
              id="account-name"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="account-title">Role at the business</Label>
            <Input
              id="account-title"
              value={draft.jobTitle}
              onChange={(e) => setDraft((d) => ({ ...d, jobTitle: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="account-email">Email</Label>
            <Input
              id="account-email"
              type="email"
              value={draft.email}
              onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
            />
            <p className="mt-1 text-xs text-text-muted">
              Used for notifications you have turned on. This is separate from the address you sign in with.
            </p>
          </div>
        </div>

        <SaveBar dirty={dirty} onSave={save} onCancel={() => setDraft(account)} />
        <UnsavedChangesDialog open={blocked} onConfirm={confirmLeave} onCancel={cancelLeave} />
      </CardContent>
    </Card>
  );
}
