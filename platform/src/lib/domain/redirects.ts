const DEFAULT_POST_AUTH_PATH = "/dashboard";

export function resolveSafeNextPath(nextValue: string | null | undefined): string {
  if (typeof nextValue !== "string") return DEFAULT_POST_AUTH_PATH;

  const trimmed = nextValue.trim();
  if (!trimmed) return DEFAULT_POST_AUTH_PATH;

  // "/\host" is treated by browsers as protocol-relative, same as "//host".
  if (trimmed.startsWith("//") || trimmed.startsWith("/\\") || trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return DEFAULT_POST_AUTH_PATH;
  }

  if (/^(?:[a-zA-Z][a-zA-Z0-9+.-]*:)/.test(trimmed)) {
    return DEFAULT_POST_AUTH_PATH;
  }

  if (!trimmed.startsWith("/")) {
    return DEFAULT_POST_AUTH_PATH;
  }

  return trimmed;
}

/** Request header carrying the requested path (set in proxy.ts). */
export const REQUEST_PATH_HEADER = "x-aw-path";
/** Remembers a page to return to across signup, email confirmation and onboarding. */
export const RETURN_TO_COOKIE = "aw_return_to";

const AUTH_FLOW_PREFIXES = [
  "/login",
  "/signup",
  "/auth/",
  "/forgot-password",
  "/reset-password",
  "/activate-account",
  "/check-email",
  "/mfa-",
  "/onboarding",
];

/** A page worth sending someone back to after signing in, or null (sign-in pages, the dashboard, anything unsafe). */
export function resolveReturnPath(value: string | null | undefined): string | null {
  const safe = resolveSafeNextPath(value);
  if (safe === DEFAULT_POST_AUTH_PATH || AUTH_FLOW_PREFIXES.some((prefix) => safe.startsWith(prefix))) return null;
  return safe;
}
