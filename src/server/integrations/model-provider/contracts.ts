import { z } from "zod";

const boundedText = (max: number) => z.string().trim().min(1).max(max);

export const modelExecutionContextSchema = z.object({
  workspaceId: boundedText(128),
  invocationId: boundedText(128),
  source: z.enum(["authenticated_user", "trusted_vapi"]),
}).strict();

const businessContextSchema = z.object({
  name: boundedText(160),
  timezone: boundedText(80),
  services: z.array(boundedText(160)).max(30).default([]),
  policies: z.array(boundedText(500)).max(20).default([]),
}).strict();

const conversationMessageSchema = z.object({
  role: z.enum(["customer", "receptionist"]),
  text: boundedText(4_000),
}).strict();

export const receptionistReplyRequestSchema = z.object({
  business: businessContextSchema,
  messages: z.array(conversationMessageSchema).min(1).max(24),
}).strict();

export const callAnalysisRequestSchema = z.object({
  businessName: boundedText(160),
  transcript: z.array(conversationMessageSchema).min(1).max(200),
}).strict();

export const receptionistReplySchema = z.object({
  text: boundedText(1_000),
  action: z.enum(["respond", "clarify", "escalate"]),
  reason: z.enum(["answer", "missing_information", "human_requested", "safety", "outside_scope"]),
}).strict();

export const callAnalysisSchema = z.object({
  summary: boundedText(2_000),
  sentiment: z.enum(["positive", "neutral", "negative", "mixed"]),
  outcome: z.enum(["resolved", "booking_requested", "escalated", "abandoned", "unknown"]),
  followUpRequired: z.boolean(),
  tags: z.array(boundedText(40)).max(8),
}).strict();

export type ModelExecutionContext = z.infer<typeof modelExecutionContextSchema>;
export type ReceptionistReplyRequest = z.infer<typeof receptionistReplyRequestSchema>;
export type ReceptionistReply = z.infer<typeof receptionistReplySchema>;
export type CallAnalysisRequest = z.infer<typeof callAnalysisRequestSchema>;
export type CallAnalysis = z.infer<typeof callAnalysisSchema>;

export type ModelTask =
  | { kind: "receptionist_reply"; request: ReceptionistReplyRequest }
  | { kind: "call_analysis"; request: CallAnalysisRequest };

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  estimatedCostMicroUsd: number;
}

export interface ModelResult<T> {
  value: T;
  usage: ModelUsage;
  simulated: boolean;
}
