import { redirect } from "next/navigation";
import Link from "next/link";
import { ShieldX } from "lucide-react";
import { AuthenticationError, AuthorizationError, requirePermission } from "@/server/auth/guards";
import type { Permission } from "@/lib/permissions";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";

/**
 * Server-rendered route presentation gate.
 *
 * This keeps a direct URL consistent with the role-filtered navigation. It is
 * defense in depth, not the data boundary: repositories return scoped DTOs and
 * every Server Action/Route Handler independently calls the same guards.
 */
export async function PermissionBoundary({
  permission,
  children,
}: {
  permission: Permission;
  children: React.ReactNode;
}) {
  try {
    await requirePermission(permission);
  } catch (error) {
    if (error instanceof AuthenticationError) redirect("/sign-in?reason=expired");
    if (error instanceof AuthorizationError) {
      return (
        <div className="p-4 md:p-6">
          <Card className="mx-auto max-w-lg">
            <CardContent className="flex flex-col items-center py-12 text-center">
              <ShieldX className="h-8 w-8 text-text-muted" aria-hidden="true" />
              <h1 className="mt-4 text-lg font-semibold text-text-primary">Access denied</h1>
              <p className="mt-1 text-sm text-text-secondary">
                Your role does not have access to this area.
              </p>
              <Button asChild variant="outline" className="mt-5">
                <Link href="/">Return to overview</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }
    throw error;
  }

  return <>{children}</>;
}
