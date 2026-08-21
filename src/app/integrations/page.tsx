import { redirect } from "next/navigation";

/**
 * The provider-facing page moved under /admin when the admin and client
 * surfaces were separated. Kept as a redirect so older links and bookmarks
 * still land somewhere sensible.
 *
 * Business users want /connections, which shows the same state without naming
 * a provider.
 */
export default function IntegrationsRedirect() {
  redirect("/admin/integrations");
}
