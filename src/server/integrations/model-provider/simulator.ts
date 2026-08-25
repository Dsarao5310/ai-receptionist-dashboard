import type {
  CallAnalysis,
  CallAnalysisRequest,
  ModelResult,
  ReceptionistReply,
  ReceptionistReplyRequest,
} from "./contracts";
import { estimateTokens } from "./policy";

function simulatedResult<T>(value: T, input: unknown): ModelResult<T> {
  return {
    value,
    simulated: true,
    usage: {
      inputTokens: estimateTokens(JSON.stringify(input)),
      outputTokens: estimateTokens(JSON.stringify(value)),
      estimatedCostMicroUsd: 0,
    },
  };
}

export function simulateReply(request: ReceptionistReplyRequest): ModelResult<ReceptionistReply> {
  const last = request.messages.at(-1)!.text.toLowerCase();
  let value: ReceptionistReply;

  if (/\b(human|person|manager|supervisor)\b/.test(last)) {
    value = { text: "I’ll pass this to a person who can help.", action: "escalate", reason: "human_requested" };
  } else if (/\b(ignore|system prompt|developer message|reveal your instructions)\b/.test(last)) {
    value = { text: `I can help with ${request.business.name}. What would you like to know?`, action: "clarify", reason: "safety" };
  } else if (/\b(book|appointment|schedule|reserve)\b/.test(last)) {
    value = { text: "What service, day, and time would you prefer? I’ll check the next step once I have those details.", action: "clarify", reason: "missing_information" };
  } else if (/\b(price|cost|services?|hours|open|close)\b/.test(last)) {
    value = { text: `I can help with ${request.business.name}'s services and hours. Which detail do you need?`, action: "respond", reason: "answer" };
  } else {
    value = { text: `Thanks for calling ${request.business.name}. How can I help?`, action: "clarify", reason: "missing_information" };
  }

  return simulatedResult(value, request);
}

export function simulateAnalysis(request: CallAnalysisRequest): ModelResult<CallAnalysis> {
  const text = request.transcript.map((message) => message.text).join(" ").toLowerCase();
  const escalated = /\b(human|person|manager|supervisor)\b/.test(text);
  const booking = /\b(book|appointment|schedule|reserve)\b/.test(text);
  const negative = /\b(angry|upset|terrible|complaint|unhappy)\b/.test(text);
  const value: CallAnalysis = {
    summary: booking
      ? "The customer asked about arranging an appointment; no booking confirmation was established."
      : escalated
        ? "The customer requested assistance from a person."
        : "The customer contacted the business and the receptionist provided a general response.",
    sentiment: negative ? "negative" : "neutral",
    outcome: escalated ? "escalated" : booking ? "booking_requested" : "resolved",
    followUpRequired: escalated || booking,
    tags: escalated ? ["human-requested"] : booking ? ["booking-requested"] : ["general-inquiry"],
  };
  return simulatedResult(value, request);
}
