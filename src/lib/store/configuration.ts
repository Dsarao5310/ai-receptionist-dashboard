"use client";

/**
 * Business + AI configuration.
 *
 * The state itself lives in `workspace-stores.tsx`, seeded from server-loaded
 * data and written through server actions. This module keeps the import path
 * the roughly-thirty existing call sites already use.
 */
export {
  useConfiguration,
  useWorkspaceReady,
  type ConfigurationState,
} from "./workspace-stores";
