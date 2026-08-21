"use client";

import { CircleDashed, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";

/**
 * Privacy and security, stated honestly.
 *
 * There is no authentication in this application yet, so nothing here pretends
 * to be switched on. Every item is marked as planned, because a settings screen
 * showing "Two-factor authentication: Enabled" when no such thing exists is
 * worse than showing nothing at all — it is a security claim the product cannot
 * back.
 *
 * These become real in the authentication phase, at which point each row gets a
 * genuine control and a genuine state.
 */

const PLANNED = [
  {
    title: "Sign-in",
    description: "Email and password, with the option of a single sign-on provider.",
  },
  {
    title: "Two-factor authentication",
    description: "A second step when signing in from a new device.",
  },
  {
    title: "Active sessions",
    description: "See where you are signed in, and sign other devices out.",
  },
  {
    title: "Team access",
    description: "Invite colleagues and choose what each of them can see and change.",
  },
  {
    title: "Data export",
    description: "Download your conversations, appointments and customer records.",
  },
];

export function SecuritySettings() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Privacy &amp; security</CardTitle>
        <CardDescription>
          Accounts are not enabled yet, so nothing below is active. Each one arrives with sign-in.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {PLANNED.map((item) => (
            <li key={item.title} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div>
                <p className="text-sm text-text-primary">{item.title}</p>
                <p className="text-xs text-text-secondary">{item.description}</p>
              </div>
              <Badge tone="neutral" className="shrink-0">
                <CircleDashed className="h-3 w-3" aria-hidden="true" />
                Planned
              </Badge>
            </li>
          ))}
        </ul>

        <p className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-surface-sunken px-3.5 py-3 text-xs text-text-secondary">
          <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden="true" />
          <span>
            Provider credentials are never held in this dashboard. They live on the server, and every request that uses
            them is checked there.
          </span>
        </p>
      </CardContent>
    </Card>
  );
}
