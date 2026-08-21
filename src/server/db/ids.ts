import "server-only";

import { randomBytes } from "node:crypto";

/**
 * Identifier generation.
 *
 * Ids are prefixed text rather than bare UUIDs. The prefix costs nothing and
 * buys a lot: an audit row reading `apt_k3f9x2` is legible, a mistyped id fails
 * obviously rather than silently addressing the wrong table, and the existing
 * catalogue ids the appointment snapshots reference (`svc_haircut`) keep
 * working unchanged.
 *
 * The random part is 96 bits from a CSPRNG, so ids are not guessable and not
 * enumerable — a user cannot walk `apt_1`, `apt_2` looking for another tenant's
 * records. That is a convenience, not the defence: the defence is that every
 * query is scoped by an authorized workspace, so guessing a real id from
 * another tenant still returns nothing.
 */
export type IdPrefix =
  | "usr"
  | "ws"
  | "mem"
  | "inv"
  | "aud"
  | "cust"
  | "conv"
  | "call"
  | "apt"
  | "svc"
  | "kn"
  | "sh"
  | "act"
  | "ntf"
  | "int"
  | "iev"
  | "wf"
  | "op"
  | "oas"
  | "blk"
  | "inev"
  | "cred"
  | "pnum"
  | "sms";

export function newId(prefix: IdPrefix): string {
  return `${prefix}_${randomBytes(12).toString("base64url")}`;
}
