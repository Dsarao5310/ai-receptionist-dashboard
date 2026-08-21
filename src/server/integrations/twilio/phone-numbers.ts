import "server-only";

/**
 * Phone numbers, in one canonical form.
 *
 * ── Why normalization is a boundary concern ─────────────────────────────────
 * The same number arrives written several ways: `+1 (604) 561-7029` from a
 * person typing, `+16045617029` from Twilio, `6045617029` from a form. If those
 * are stored as they arrive, the tenant mapping stops working — a lookup for
 * one spelling misses a row holding another, and an inbound message from a real
 * customer is refused as "unrecognised number".
 *
 * So there is exactly one stored form, E.164, and everything crossing the
 * boundary is normalized into it before it is used to look anything up. The
 * database's own `~ '^\+[1-9][0-9]{7,14}$'` check is the backstop, not the
 * mechanism.
 *
 * ── What this deliberately does not do ──────────────────────────────────────
 * It is not a libphonenumber replacement. It does not validate that a number is
 * assignable, does not know area codes, and does not guess countries beyond a
 * single explicit default. Guessing is how a UK number becomes a US one; where
 * this cannot be certain it returns null and the caller refuses the input.
 */

const E164 = /^\+[1-9]\d{7,14}$/;

/** Already-canonical, or not a phone number at all. */
export function isE164(value: string): boolean {
  return E164.test(value);
}

/**
 * Canonicalize a number, or refuse it.
 *
 * `defaultCountryCode` is applied only to a bare national number of plausible
 * length, and only when one is supplied. A caller that does not know the
 * country gets null rather than a North American guess.
 */
export function toE164(raw: string, defaultCountryCode?: string): string | null {
  if (!raw) return null;

  const trimmed = raw.trim();

  // `00` is the international prefix in much of the world and means the same
  // thing as `+`. Everything else that is not a digit is punctuation.
  const withPlus = trimmed.startsWith("00") ? `+${trimmed.slice(2)}` : trimmed;
  const hadPlus = withPlus.startsWith("+");
  const digits = withPlus.replace(/\D/g, "");

  if (!digits) return null;

  if (hadPlus) {
    const candidate = `+${digits}`;
    return E164.test(candidate) ? candidate : null;
  }

  if (!defaultCountryCode) return null;

  const cc = defaultCountryCode.replace(/\D/g, "");
  if (!cc) return null;

  // A number that already starts with the country code is not given a second
  // one — `16045617029` with a default of `1` is the same number, not `+1 1…`.
  const national = digits.startsWith(cc) && digits.length > 10 ? digits.slice(cc.length) : digits;
  const candidate = `+${cc}${national}`;
  return E164.test(candidate) ? candidate : null;
}

/**
 * For display in an admin surface. Never used as a key.
 *
 * Deliberately conservative: it formats North American numbers and leaves
 * everything else in E.164 rather than inventing a grouping for a country
 * whose conventions it does not know.
 */
export function formatForDisplay(e164: string): string {
  const match = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return match ? `+1 (${match[1]}) ${match[2]}-${match[3]}` : e164;
}
