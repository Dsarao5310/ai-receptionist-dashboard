"use client";

/**
 * Kept as the import path four admin/client pages already use for "has the
 * data arrived yet".
 *
 * What it used to be was a deferred-rehydration mechanism: the stores read from
 * local storage while being created, so the first client render disagreed with
 * the server's, and `skipHydration` plus an effect plus skeletons existed to
 * paper over it. With the data now loaded on the server and passed as props,
 * server and client render the same markup from the same values — so there is
 * no rehydration to defer, and this is simply "did the payload arrive".
 */
export { useWorkspaceReady as useHydrated } from "./workspace-stores";
