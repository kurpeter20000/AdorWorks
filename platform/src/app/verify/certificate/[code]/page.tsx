import type { Metadata } from "next";
import Link from "next/link";
import { Award } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PROGRAMME_TYPES, type ProgrammeType } from "@/lib/domain/pathways";
import { formatDate } from "@/lib/domain/format";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Check a certificate"), robots: { index: false } };
}

/** Public certificate check (0123): anyone with the check code. Never shows contact details. */
export default async function VerifyCertificatePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const t = await getT();
  const supabase = await createClient();
  const clean = decodeURIComponent(code).trim().slice(0, 40);
  const { data } = /^[A-Za-z0-9-]{6,40}$/.test(clean) ? await supabase.rpc("verify_certificate", { p_code: clean }) : { data: null };
  const c = data?.[0] ?? null;

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10 sm:px-6">
      <p className="text-center text-xs font-extrabold tracking-wider text-slate uppercase">{t("AdorWorks certificate check")}</p>
      <section className="mt-3 rounded-card border border-line bg-white p-6 text-center shadow-raised">
        {!c ? (
          <>
            <h1 className="text-xl font-extrabold text-midnight">{t("No certificate matches this code")}</h1>
            <p className="mt-2 text-sm text-slate">{t("Check the code and try again. Codes look like CERT-7KQ4ZD2M.")}</p>
          </>
        ) : c.revoked ? (
          <>
            <h1 className="text-xl font-extrabold text-coral-ink">{t("This certificate has been withdrawn")}</h1>
            <p className="mt-2 text-sm text-slate">{t("Contact AdorWorks if you have questions about it.")}</p>
          </>
        ) : (
          <>
            <Award className="mx-auto size-10 text-teal-ink" aria-hidden="true" />
            <h1 className="mt-2 text-2xl font-extrabold text-midnight">
              <span className="no-i18n">{c.talent_name}</span>
            </h1>
            <p className="mt-2 text-sm text-midnight">
              {t("completed {programme}", { programme: t(PROGRAMME_TYPES[(c.programme_type ?? "other") as ProgrammeType] ?? PROGRAMME_TYPES.other) })}
            </p>
            <p className="mt-1 text-sm text-slate">
              <span className="no-i18n">{c.programme_name}</span> · <span className="no-i18n">{c.partner_name}</span>
            </p>
            <p className="mt-3 text-sm font-semibold text-midnight">{t("Issued {date}", { date: formatDate(c.issued_at, { day: "numeric", month: "long", year: "numeric" }) })}</p>
            <p className="mt-1 font-mono text-xs text-slate">{clean.toUpperCase()}</p>
          </>
        )}
      </section>
      <p className="mt-4 text-center text-sm">
        <Link href="/" className="font-bold text-teal-ink underline">
          {t("What is AdorWorks?")}
        </Link>
      </p>
    </main>
  );
}
