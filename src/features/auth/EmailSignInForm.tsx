"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";

/**
 * The email/password half of the sign-in page.
 *
 * There is no password infrastructure in this application yet — no hash
 * column, no verification, no reset flow. Rendering a form that silently
 * "succeeded" or failed with a generic error would misrepresent that. Instead
 * submitting surfaces the honest reason inline, the same way the page already
 * does for Google when its credentials are missing.
 */
export function EmailSignInForm() {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
      >
        <Mail className="h-4 w-4" aria-hidden="true" />
        Sign in with email
      </button>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setNotice(true);
      }}
    >
      <div>
        <Label htmlFor="email-address">Email</Label>
        <Input id="email-address" type="email" autoComplete="email" placeholder="you@business.com" required />
      </div>
      <div>
        <div className="flex items-baseline justify-between">
          <Label htmlFor="email-password" className="mb-1.5">
            Password
          </Label>
          <span className="mb-1.5 text-xs text-text-muted">Forgot password?</span>
        </div>
        <Input id="email-password" type="password" autoComplete="current-password" placeholder="••••••••" required />
      </div>

      {notice && (
        <p role="status" className="rounded-lg border border-border bg-surface-sunken px-3.5 py-3 text-xs text-text-secondary">
          Email sign-in is not available on this deployment yet — password accounts have not been built. Use Google
          above, or ask an administrator for access.
        </p>
      )}

      <Button type="submit" variant="secondary" className="w-full">
        Continue
      </Button>
    </form>
  );
}
