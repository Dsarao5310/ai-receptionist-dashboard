import type { ProviderId } from "@/types";
import type { IntegrationAdapter } from "./types";
import { vapiAdapter } from "./mock/vapi";
import { twilioAdapter } from "./mock/twilio";
import { googleCalendarAdapter } from "./mock/google-calendar";
import { gmailAdapter } from "./mock/gmail";
import { n8nAdapter } from "./mock/n8n";
import { pineconeAdapter } from "./mock/pinecone";
import { modelProviderAdapter } from "./mock/model-provider";

/**
 * The one place a provider id turns into an implementation.
 *
 * Everything above this file addresses providers by id and never imports an
 * adapter module directly, so replacing a mock with a real, server-backed
 * adapter is a single line here.
 *
 * All current implementations are mocks over local demo state. None performs a
 * network call, none holds a credential, and none parses a timestamp itself —
 * see ./types.ts for the rules they are held to.
 */
const ADAPTERS: Record<ProviderId, IntegrationAdapter> = {
  vapi: vapiAdapter,
  twilio: twilioAdapter,
  google_calendar: googleCalendarAdapter,
  gmail: gmailAdapter,
  n8n: n8nAdapter,
  pinecone: pineconeAdapter,
  model_provider: modelProviderAdapter,
};

export function getAdapter(provider: ProviderId): IntegrationAdapter {
  return ADAPTERS[provider];
}

export type { IntegrationAdapter, AdapterContext, TestResult, RecordPatch } from "./types";
