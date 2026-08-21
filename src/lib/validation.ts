/**
 * Small field validators returning a message or null. Kept pure and separate
 * from the forms so the same rule can be shown inline while typing and re-checked
 * on save, rather than duplicating the logic in two places.
 */

export type Validator = (value: string) => string | null;

export function required(label: string): Validator {
  return (v) => (v.trim().length === 0 ? `${label} is required.` : null);
}

export const email: Validator = (v) => {
  if (!v.trim()) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? null : "Enter a valid email address.";
};

export const phone: Validator = (v) => {
  if (!v.trim()) return null;
  const digits = v.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15 ? null : "Enter a valid phone number.";
};

export const website: Validator = (v) => {
  if (!v.trim()) return null;
  try {
    const url = new URL(v.trim().startsWith("http") ? v.trim() : `https://${v.trim()}`);
    return url.hostname.includes(".") ? null : "Enter a valid website address.";
  } catch {
    return "Enter a valid website address.";
  }
};

export function numberInRange(label: string, min: number, max: number): (value: number) => string | null {
  return (v) => {
    if (!Number.isFinite(v)) return `${label} must be a number.`;
    if (v < min) return `${label} must be at least ${min}.`;
    if (v > max) return `${label} can't be more than ${max}.`;
    return null;
  };
}

/** Opening time must precede closing time — a rule the hours editor checks per interval. */
export function timeOrder(open: string, close: string): string | null {
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  if (!open || !close) return "Both an opening and closing time are needed.";
  return toMin(open) < toMin(close) ? null : "Closing time must be after opening time.";
}

export function runValidators(value: string, validators: Validator[]): string | null {
  for (const v of validators) {
    const result = v(value);
    if (result) return result;
  }
  return null;
}
