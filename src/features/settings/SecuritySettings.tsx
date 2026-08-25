"use client";

import { CircleDashed, ShieldCheck, Check } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";

/**
 * Privacy and security, stated honestly.
 *
 * This panel used to mark every row "Planned" on the premise that the product
 * had no authentication. That stopped being true: Auth.js v5 with Google
 * single sign-on is live, sessions expire and rotate on a real schedule
 * (`server/auth/config.ts`), and workspace roles are enforced on the server for
 * every request.
 *
 * Understating what protects an account is the same category of error as
 * overstating it — both leave the reader with a false picture of their own
 * security. So each row now carries its actual state, and the planned items say
 * specifically what is missing rather than implying nothing works.
 */

const ACTIVE = [
  {
    title: "Sign-in",
    description: "Google single sign-on. Your password is never handled by this dashboard.",
  },
  {
    title: "Session expiry",
    description: "Signing in lasts eight hours, and the session is refreshed hourly while you work.",
  },
  {
    title: "Team roles",
    description: "Owner, manager and staff. Every request re-checks your role on the server.",
  },
];

const PLANNED = [
  {
    title: "Two-factor authentication",
    description: "A second step when signing in from a new device.",
  },
  {
    title: "Active session management",
    description: "See every device you are signed in on, and sign the others out.",
  },
  {
    title: "Member invitations",
    description: "Invite colleagues by email from this screen instead of an administrator adding them.",
  },
  {
    title: "Data export",
    description: "Download your conversations, appointments and customer records.",
  },
];

function Row({
  title,
  description,
  badge,
}: {
  title: string;
  description: string;
  badge: React.ReactNode;
}) {
  return (
    <li className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div>
        <p className="text-sm text-text-primary">{title}</p>
        <p className="text-xs text-text-secondary">{description}</p>
      </div>
      {badge}
    </li>
  );
}

export function SecuritySettings() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Privacy &amp; security</CardTitle>
        <CardDescription>What protects your account today, and what is still to come.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Active</p>
          <ul className="divide-y divide-border">
            {ACTIVE.map((item) => (
              <Row
                key={item.title}
                title={item.title}
                description={item.description}
                badge={
                  <Badge tone="success" className="shrink-0">
                    <Check className="h-3 w-3" aria-hidden="true" />
                    Active
                  </Badge>
                }
              />
            ))}
          </ul>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Planned</p>
          <ul className="divide-y divide-border">
            {PLANNED.map((item) => (
              <Row
                key={item.title}
                title={item.title}
                description={item.description}
                badge={
                  <Badge tone="neutral" className="shrink-0">
                    <CircleDashed className="h-3 w-3" aria-hidden="true" />
                    Planned
                  </Badge>
                }
              />
            ))}
          </ul>
        </div>

        <p className="flex items-start gap-2 rounded-lg border border-border bg-surface-sunken px-3.5 py-3 text-xs text-text-secondary">
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
