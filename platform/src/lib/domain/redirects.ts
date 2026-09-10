const DEFAULT_POST_AUTH_PATH = "/dashboard";

export function resolveSafeNextPath(nextValue: string | null | undefined): string {
  if (typeof nextValue !== "string") return DEFAULT_POST_AUTH_PATH;

  const trimmed = nextValue.trim();
  if (!trimmed) return DEFAULT_POST_AUTH_PATH;

  if (trimmed.startsWith("//") || trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
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
