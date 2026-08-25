"use client";

import { useOptionalSession } from "@/lib/session-context";
import { WORKSPACE_ROLE_LABELS } from "@/lib/permissions";

/**
 * The identity line shown next to an avatar: name, email, and the role label
 * for the workspace currently in view.
 *
 * Extracted so the account menu has exactly one place that resolves "what do
 * we call this person's role here" — a platform operator outside any
 * workspace role, or a workspace member with owner/manager/staff.
 */
export function useAccountSummary() {
  const session = useOptionalSession();

  const workspaceName = session?.availableWorkspaces.find((w) => w.id === session.workspaceId)?.name ?? "";
  const roleLabel = session?.workspaceRole
    ? WORKSPACE_ROLE_LABELS[session.workspaceRole]
    : session?.user.platformRole === "operator"
      ? "Platform operator"
      : null;

  return {
    name: session?.user.name ?? "",
    email: session?.user.email ?? "",
    workspaceName,
    roleLabel,
  };
}
