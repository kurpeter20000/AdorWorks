const KNOWN_PRODUCTION_PROJECT_REFS = new Set(["cpiebggzbxshzvlzqdfn"]);

export interface E2EEnvironment {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  SUPABASE_SECRET_KEY?: string;
  E2E_ALLOW_MUTATIONS?: string;
  E2E_EXPECTED_SUPABASE_PROJECT_REF?: string;
}

function projectReference(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("E2E safety check failed: NEXT_PUBLIC_SUPABASE_URL is not a valid URL.");
  }

  if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) return "local";
  if (url.protocol !== "https:" || !url.hostname.endsWith(".supabase.co")) {
    throw new Error("E2E safety check failed: use a Supabase project URL or a local Supabase instance.");
  }

  return url.hostname.slice(0, -".supabase.co".length);
}

/**
 * Mutating browser tests are deliberately fail-closed. A caller must name
 * the exact disposable project as well as opt in; matching the known
 * production project is rejected even if both values are supplied.
 */
export function validateE2EEnvironment(environment: E2EEnvironment): Required<E2EEnvironment> {
  if (environment.E2E_ALLOW_MUTATIONS !== "true") {
    throw new Error("E2E safety check failed: set E2E_ALLOW_MUTATIONS=true for a disposable test project.");
  }

  const url = environment.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = environment.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const secretKey = environment.SUPABASE_SECRET_KEY?.trim();
  const expectedRef = environment.E2E_EXPECTED_SUPABASE_PROJECT_REF?.trim();
  if (!url || !anonKey || !secretKey || !expectedRef) {
    throw new Error("E2E safety check failed: the test URL, keys, and expected project ref are required.");
  }

  const actualRef = projectReference(url);
  if (KNOWN_PRODUCTION_PROJECT_REFS.has(actualRef)) {
    throw new Error("E2E safety check failed: refusing to mutate the known production Supabase project.");
  }
  if (actualRef !== expectedRef) {
    throw new Error(`E2E safety check failed: expected project "${expectedRef}" but URL resolves to "${actualRef}".`);
  }

  return {
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    SUPABASE_SECRET_KEY: secretKey,
    E2E_ALLOW_MUTATIONS: "true",
    E2E_EXPECTED_SUPABASE_PROJECT_REF: expectedRef,
  };
}
