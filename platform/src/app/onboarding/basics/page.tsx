import type { Metadata } from "next";
import { requireRole } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { BasicsForm } from "./basics-form";

export const metadata: Metadata = { title: "Your basics" };

export default async function BasicsPage() {
  const session = await requireRole("talent");
  const supabase = await createClient();

  const [{ data: profile }, { data: honorifics }] = await Promise.all([
    supabase.from("talent_profiles").select("*").eq("id", session.userId).maybeSingle(),
    supabase.from("honorifics").select("code, label").order("label"),
  ]);

  return (
    <div>
      <h1 className="text-xl font-bold text-midnight">Your basics</h1>
      <p className="mt-1 text-sm text-slate">
        Legal name stays private — only your display name and headline are ever shown publicly.
      </p>
      <BasicsForm honorifics={honorifics ?? []} initial={profile} />
    </div>
  );
}
