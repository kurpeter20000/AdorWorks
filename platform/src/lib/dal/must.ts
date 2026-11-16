/**
 * Fail loudly on a Supabase read error.
 *
 * Pages used to destructure only `data` and ignore `error`, so a transient
 * PostgREST/RLS failure rendered as "No applications yet" or a contract
 * with no milestones — wrong, and indistinguishable from the truth. Wrap
 * the awaited query instead:
 *
 *   const { data: offers } = must(await supabase.from("offers").select(...), "offers");
 *
 * On error this throws, so the route's error.tsx shows "Something went
 * wrong — Try again" (which re-fetches). The message is logged server-side;
 * production builds don't show it to the user. Fallback branches like
 * `: { data: [] }` have no `error` and pass straight through.
 */
export function must<R extends object>(result: R, what: string): R {
  const error = "error" in result ? (result.error as { message?: string } | null | undefined) : null;
  if (error) {
    throw new Error(`Could not load ${what}: ${error.message ?? "unknown error"}`);
  }
  return result;
}
