export function normalizeEmailAddress(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (normalized.length < 3 || normalized.length > 320) return null;
  if (/\s|[<>\r\n]/.test(normalized)) return null;
  const at = normalized.indexOf("@");
  if (at < 1 || at !== normalized.lastIndexOf("@") || at === normalized.length - 1) return null;
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  if (local.length > 64 || domain.length > 255 || !domain.includes(".")) return null;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return null;
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local)) return null;
  if (!/^[a-z0-9.-]+$/i.test(domain) || domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) {
    return null;
  }
  return normalized;
}
