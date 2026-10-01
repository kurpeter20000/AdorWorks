import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { PhoneVerificationWidget } from "@/components/phone-verification-widget";
import { NotificationsList } from "./notifications-list";
import { EmailPreferenceToggle } from "./email-preference-toggle";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Notifications") };
}

export default async function NotificationsPage() {
  const session = await requireSession();
  const supabase = await createClient();
  const t = await getT();

  const { data: notifications } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", session.userId)
    .order("created_at", { ascending: false })
    .limit(100);

  const { data: profile } = await supabase
    .from("profiles")
    .select("email_notifications_enabled")
    .eq("id", session.userId)
    .single();

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-midnight">{t("Notifications")}</h1>
        <Link href="/dashboard" className="text-sm font-semibold text-teal-ink underline">
          {t("Dashboard")}
        </Link>
      </div>

      {!session.phoneVerified && <PhoneVerificationWidget />}

      <EmailPreferenceToggle initialEnabled={profile?.email_notifications_enabled ?? true} />

      {!notifications || notifications.length === 0 ? (
        <p className="mt-8 text-sm text-slate">{t("Nothing yet — you'll see updates here as things happen.")}</p>
      ) : (
        <NotificationsList notifications={notifications} />
      )}
    </main>
  );
}
