"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createTeamChannel } from "@/lib/actions/teamChat";
import { useT } from "@/i18n/client";

/** Organisation admins (and AdorWorks admins, for staff) add a channel. */
export function NewChannel() {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-semibold text-teal-ink hover:bg-cloud">
        <Plus className="size-4" aria-hidden /> {t("New channel")}
      </button>
    );
  }
  return (
    <form
      className="space-y-2 rounded-xl border border-line bg-white p-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await createTeamChannel(name, about);
          if (r.error) setError(r.error);
          else if (r.key) {
            setOpen(false);
            setName("");
            setAbout("");
            router.push(`/team-chat?t=${r.key}`);
          }
        });
      }}
    >
      <label className="block text-xs font-semibold text-midnight">
        {t("Channel name")}
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required className="mt-1 min-h-10 w-full rounded-lg border border-slate/25 px-2.5 text-sm" placeholder={t("e.g. Hiring for the Juba office")} />
      </label>
      <label className="block text-xs font-semibold text-midnight">
        {t("What it's for (optional)")}
        <input value={about} onChange={(e) => setAbout(e.target.value)} maxLength={200} className="mt-1 min-h-10 w-full rounded-lg border border-slate/25 px-2.5 text-sm" />
      </label>
      {error && <p className="text-xs text-coral-ink" role="alert">{t(error)}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="min-h-10 rounded-lg bg-primary px-3 text-sm font-bold text-white disabled:opacity-60">
          {pending ? t("Creating…") : t("Create")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-10 rounded-lg px-3 text-sm font-semibold text-slate">
          {t("Cancel")}
        </button>
      </div>
    </form>
  );
}
