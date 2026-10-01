import type { Metadata } from "next";
import { requireRole } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { CATEGORY_LABEL } from "@/lib/domain/taxonomy";
import { ReviewForm } from "./review-form";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Review & publish") };
}

export default async function ReviewPage() {
  const session = await requireRole("talent");
  const supabase = await createClient();
  const t = await getT();

  const { data: profile } = await supabase
    .from("talent_profiles")
    .select("*")
    .eq("id", session.userId)
    .maybeSingle();

  return (
    <div>
      <h1 className="text-xl font-bold text-midnight">{t("Review your profile")}</h1>
      <p className="mt-1 text-sm text-slate">
        {t("Creating a profile does not guarantee work — we assess eligibility and fit for each opportunity, and we will never ask you to pay a fee to be considered.")}
      </p>

      <dl className="mt-6 space-y-3 rounded-xl border border-slate/15 bg-white p-5 text-sm">
        <div>
          <dt className="font-semibold text-midnight">{t("Display name")}</dt>
          <dd className="text-slate">{profile?.display_name ?? "—"}</dd>
        </div>
        <div>
          <dt className="font-semibold text-midnight">{t("Headline")}</dt>
          <dd className="text-slate">{profile?.headline ?? "—"}</dd>
        </div>
        <div>
          <dt className="font-semibold text-midnight">{t("Category")}</dt>
          <dd className="text-slate">{profile?.category ? t(CATEGORY_LABEL[profile.category]) : "—"}</dd>
        </div>
        <div>
          <dt className="font-semibold text-midnight">{t("Skills")}</dt>
          <dd className="text-slate">{profile?.skills?.join(", ") || "—"}</dd>
        </div>
        <div>
          <dt className="font-semibold text-midnight">{t("Location")}</dt>
          <dd className="text-slate">{profile?.location ?? "—"}</dd>
        </div>
      </dl>

      <ReviewForm />
    </div>
  );
}
