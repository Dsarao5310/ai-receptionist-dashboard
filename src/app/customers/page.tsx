import type { SearchParams } from "@/lib/filter-params";
import CustomersView from "./view";

/**
 * Deep-linked from another page, e.g. "/customers?open=cust_12". The id is read
 * here so the drawer can open on the first paint rather than after hydration.
 * It is only a hint about which row to show — the customer itself still comes
 * from the workspace-scoped dataset, so an id from another tenant opens nothing.
 */
export default async function CustomersPage({ searchParams }: { searchParams: SearchParams }) {
  const open = (await searchParams).open;
  return <CustomersView openCustomerId={typeof open === "string" ? open : null} />;
}
