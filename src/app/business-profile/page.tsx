import type { SearchParams } from "@/lib/filter-params";
import { readParam } from "@/lib/filter-params";
import BusinessProfileView from "./view";
import { type ProfileTab, PROFILE_TABS } from "./tabs";

/** The AI Receptionist page links straight to a section, e.g. "?tab=knowledge". */
export default async function BusinessProfilePage({ searchParams }: { searchParams: SearchParams }) {
  const params = new URLSearchParams(
    Object.entries(await searchParams).flatMap(([k, v]) =>
      v === undefined ? [] : [[k, Array.isArray(v) ? v[0] : v] as [string, string]]
    )
  );

  return <BusinessProfileView initialTab={readParam<ProfileTab>(params, "tab", PROFILE_TABS, "details")} />;
}
