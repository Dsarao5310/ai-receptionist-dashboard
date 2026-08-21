import { AlertTriangle, CheckCircle2, CircleDashed, CircleSlash, Loader2, MinusCircle } from "lucide-react";
import type { CapabilityStatus, ConnectionStatus, HealthStatus } from "@/types";
import { Badge } from "@/components/ui/Badge";
import {
  CAPABILITY_STATUS_LABELS,
  CONNECTION_LABELS,
  HEALTH_LABELS,
  SYSTEM_HEALTH_LABELS,
  type SystemHealthState,
} from "@/services/integrations";

/**
 * Status is never communicated by colour alone.
 *
 * Every badge below carries an icon whose shape differs per state and a word
 * that names it, so the meaning survives greyscale, colour blindness, and a
 * screen reader reading the label out. The colour is reinforcement, not the
 * message.
 */

type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

const CONNECTION_TONE: Record<ConnectionStatus, Tone> = {
  connected: "success",
  connecting: "info",
  disconnected: "neutral",
  needs_attention: "warning",
  error: "danger",
  not_configured: "neutral",
};

const CONNECTION_ICON: Record<ConnectionStatus, typeof CheckCircle2> = {
  connected: CheckCircle2,
  connecting: Loader2,
  disconnected: MinusCircle,
  needs_attention: AlertTriangle,
  error: CircleSlash,
  not_configured: CircleDashed,
};

export function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  const Icon = CONNECTION_ICON[status];
  return (
    <Badge tone={CONNECTION_TONE[status]}>
      <Icon className={`h-3 w-3 ${status === "connecting" ? "animate-spin" : ""}`} aria-hidden="true" />
      {CONNECTION_LABELS[status]}
    </Badge>
  );
}

const HEALTH_TONE: Record<HealthStatus, Tone> = {
  healthy: "success",
  degraded: "warning",
  down: "danger",
  unknown: "neutral",
};

const HEALTH_ICON: Record<HealthStatus, typeof CheckCircle2> = {
  healthy: CheckCircle2,
  degraded: AlertTriangle,
  down: CircleSlash,
  unknown: CircleDashed,
};

export function HealthBadge({ status }: { status: HealthStatus }) {
  const Icon = HEALTH_ICON[status];
  return (
    <Badge tone={HEALTH_TONE[status]}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      Health: {HEALTH_LABELS[status]}
    </Badge>
  );
}

const CAPABILITY_TONE: Record<CapabilityStatus, Tone> = {
  connected: "success",
  connecting: "info",
  needs_attention: "warning",
  not_configured: "neutral",
  offline: "danger",
};

const CAPABILITY_ICON: Record<CapabilityStatus, typeof CheckCircle2> = {
  connected: CheckCircle2,
  connecting: Loader2,
  needs_attention: AlertTriangle,
  not_configured: CircleDashed,
  offline: CircleSlash,
};

export function CapabilityBadge({ status }: { status: CapabilityStatus }) {
  const Icon = CAPABILITY_ICON[status];
  return (
    <Badge tone={CAPABILITY_TONE[status]}>
      <Icon className={`h-3 w-3 ${status === "connecting" ? "animate-spin" : ""}`} aria-hidden="true" />
      {CAPABILITY_STATUS_LABELS[status]}
    </Badge>
  );
}

const SYSTEM_TONE: Record<SystemHealthState, Tone> = {
  operational: "success",
  degraded: "warning",
  down: "danger",
  not_configured: "neutral",
};

const SYSTEM_ICON: Record<SystemHealthState, typeof CheckCircle2> = {
  operational: CheckCircle2,
  degraded: AlertTriangle,
  down: CircleSlash,
  not_configured: CircleDashed,
};

export function SystemHealthBadge({ state }: { state: SystemHealthState }) {
  const Icon = SYSTEM_ICON[state];
  return (
    <Badge tone={SYSTEM_TONE[state]}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {SYSTEM_HEALTH_LABELS[state]}
    </Badge>
  );
}
