import type { Metadata } from "next";
import Link from "next/link";
import { requireOrganisationMembership } from "@/lib/dal/organisation";
import { createClient } from "@/lib/supabase/server";
import { LogoUpload } from "../logo-upload";

export const metadata: Metadata = { title: "Organisation logo" };

export default async function OrganisationLogoPage() {
  const { org } = await requireOrganisationMembership();
  const supabase = await createClient();
  const logoUrl = org.logo_path ? supabase.storage.from("org-logos").getPublicUrl(org.logo_path).data.publicUrl : null;

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <Link href="/organisation" className="text-sm font-semibold text-violet underline">
        &larr; Back to organisation
      </Link>
      <h1 className="mt-3 text-2xl font-extrabold text-midnight">Logo</h1>
      <p className="mt-1 text-sm text-slate">Shown to talent on your opportunities.</p>
      <div className="mt-6 rounded-xl border border-slate/15 bg-white p-5">
        <LogoUpload orgId={org.id} existingUrl={logoUrl} />
      </div>
    </main>
  );
}
