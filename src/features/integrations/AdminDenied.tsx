import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * What a non-administrator sees where an admin surface would be.
 *
 * Extracted so the client-side `AdminGate` and the server-side permission
 * checks show the same thing. The wording deliberately does not say what is
 * behind the door — a business owner does not need to learn that provider
 * configuration exists in order to be told they cannot see it.
 */
export function AdminDenied() {
  return (
    <div className="p-4 md:p-6">
      <EmptyState
        icon={ShieldAlert}
        title="Administrator access required"
        description="This area holds provider and workspace configuration. Your account does not have access to it."
        action={
          <Button asChild size="sm" variant="outline">
            <Link href="/connections">View system status instead</Link>
          </Button>
        }
      />
    </div>
  );
}
