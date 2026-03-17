// Allowlist-based href sanitizer — blocks javascript:, data:, vbscript:, etc.
// Strips control characters before protocol check to defeat browser bypass vectors
// (e.g. "java\tscript:" → browsers collapse to "javascript:")

const SAFE_PROTOCOL = /^(https?:|mailto:|tel:|\/|#)/i;

/** Returns sanitized URL string, or null if the protocol is unsafe. */
export function sanitizeHref(url: string): string | null {
  const trimmed = url.replace(/[\x00-\x20]+/g, '');
  if (!trimmed) return null;
  if (SAFE_PROTOCOL.test(trimmed)) return url.trim();
  return null;
}
