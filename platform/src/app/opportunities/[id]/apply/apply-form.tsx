"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { applyToOpportunity, saveApplicationDraft } from "@/lib/actions/applications";
import type { FormState } from "@/lib/actions/auth";
import { useT } from "@/i18n/client";
import { msg } from "@/i18n/config";
import { cn } from "@/lib/utils";

const initialState: FormState = {};
const MIN_PITCH = 30;
const AUTOSAVE_MS = 1500;

const STEPS = [
  { title: msg("Check your Passport details"), note: msg("Filled in for you. Update anything that's out of date.") },
  { title: msg("Why you're a fit"), note: msg("A few lines on your experience and how you'd do the work.") },
  { title: msg("Answer and send"), note: msg("Any questions from the employer, then send.") },
] as const;

type SaveState = "idle" | "saving" | "saved" | "offline";

/**
 * Spec "Apply in 3 steps, saved drafts": the Passport fills step 1, and
 * progress saves as you type and on every step, so a dropped connection
 * loses nothing — the draft is waiting on this page and in Applications.
 */
export function ApplyForm({
  opportunityId,
  questions,
  initialPitch,
  initialAnswers,
  passport,
}: {
  opportunityId: string;
  questions: { id: string; question: string; required: boolean }[];
  initialPitch: string;
  initialAnswers: Record<string, string>;
  passport: { name: string | null; headline: string | null; location: string | null; skills: string[] };
}) {
  const t = useT();
  const boundAction = applyToOpportunity.bind(null, opportunityId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState(initialPitch.trim().length >= MIN_PITCH ? 2 : 0);
  const [pitch, setPitch] = useState(initialPitch);
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const [pitchError, setPitchError] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>("idle");

  // A server-side pitch error sends them back to step 2 (adjust-on-change
  // pattern: compare against the last result seen, no effect needed).
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.errors?.pitch) setStep(1);
  }

  // Autosave: shortly after typing stops. A failure only changes the
  // little status line — it never blocks typing or sending.
  const dirty = useRef(false);
  useEffect(() => {
    if (!dirty.current || pending) return;
    const handle = setTimeout(() => {
      setSave("saving");
      saveApplicationDraft(opportunityId, pitch, answers)
        .then((r) => setSave(r.error ? "offline" : "saved"))
        .catch(() => setSave("offline"));
    }, AUTOSAVE_MS);
    return () => clearTimeout(handle);
  }, [pitch, answers, opportunityId, pending]);

  function edit(fn: () => void) {
    dirty.current = true;
    setSave("idle");
    fn();
  }

  function next() {
    if (step === 1 && pitch.trim().length < MIN_PITCH) {
      setPitchError(t("Tell them a bit more about why you're a fit — at least 30 characters."));
      return;
    }
    setPitchError(null);
    setStep((s) => Math.min(2, s + 1));
  }

  const saveText =
    save === "saving" ? t("Saving…") : save === "saved" ? t("Saved. You can come back any time before sending.") : save === "offline" ? t("Couldn't save just now — keep going, we'll try again.") : null;

  return (
    <form ref={formRef} action={formAction} className="mt-3 space-y-4">
      <ol className="space-y-1">
        {STEPS.map((s, i) => {
          const done = i < step;
          const current = i === step;
          return (
            <li key={s.title}>
              <button
                type="button"
                onClick={() => (i <= step ? setStep(i) : next())}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "flex w-full items-start gap-3 rounded-control border p-2.5 text-start",
                  current ? "border-teal/40 bg-teal/5" : "border-transparent hover:bg-cloud"
                )}
              >
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-extrabold",
                    done || current ? "bg-primary text-white" : "bg-cloud text-slate"
                  )}
                >
                  {done ? <Check className="size-4" aria-hidden="true" /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-extrabold text-midnight">{t(s.title)}</span>
                  <span className="block text-xs text-slate">{t(s.note)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {/* Step 1 — the Passport speaks for them. */}
      <div hidden={step !== 0} className="space-y-2 rounded-control border border-line bg-cloud/60 p-3 text-sm">
        <p className="font-extrabold text-midnight">{passport.name ?? t("Your name")}</p>
        <p className="text-slate">{passport.headline || t("No headline yet")}</p>
        {passport.location && <p className="text-slate">{passport.location}</p>}
        <p className="text-slate">
          {passport.skills.length > 0 ? passport.skills.slice(0, 8).join(" · ") : t("No skills added yet — employers look for these first.")}
        </p>
        <Link href="/passport" className="inline-block font-bold text-teal-ink underline">
          {t("Update my Passport")}
        </Link>
      </div>

      {/* Step 2 — the pitch. Always in the form so it's sent with step 3. */}
      <div hidden={step !== 1}>
        <label htmlFor="pitch" className="text-sm font-semibold text-midnight">
          {t("Why are you a fit for this?")}
        </label>
        <textarea
          id="pitch"
          name="pitch"
          rows={6}
          value={pitch}
          onChange={(e) => edit(() => setPitch(e.target.value))}
          placeholder={t("Share relevant experience, how you'd approach this, or anything that sets you apart.")}
          className="mt-1 w-full rounded-control border border-slate/25 px-3 py-2 text-sm"
          aria-describedby="pitch-count"
        />
        <p id="pitch-count" className="mt-1 text-xs text-slate">
          {pitch.trim().length < MIN_PITCH
            ? t("{n} more characters needed", { n: MIN_PITCH - pitch.trim().length })
            : t("Looks good")}
        </p>
        {(pitchError || state.errors?.pitch) && <p className="mt-1 text-sm text-coral-ink">{pitchError ?? t(state.errors!.pitch![0])}</p>}
      </div>

      {/* Step 3 — screening questions (if any) and send. */}
      <div hidden={step !== 2} className="space-y-4">
        {questions.length > 0 ? (
          <div className="space-y-4 rounded-control border border-line bg-cloud/60 p-3">
            {questions.map((q) => (
              <div key={q.id}>
                <label htmlFor={`answer-${q.id}`} className="text-sm text-midnight">
                  {q.question} {q.required && <span className="text-coral-ink">*</span>}
                </label>
                <input
                  id={`answer-${q.id}`}
                  name={`answer-${q.id}`}
                  value={answers[q.id] ?? ""}
                  onChange={(e) => edit(() => setAnswers((a) => ({ ...a, [q.id]: e.target.value })))}
                  aria-required={q.required}
                  className="mt-1 w-full rounded-control border border-slate/25 px-3 py-2 text-sm"
                />
                {state.errors?.[`answer-${q.id}`] && <p className="mt-1 text-sm text-coral-ink">{t(state.errors[`answer-${q.id}`][0])}</p>}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate">{t("No extra questions for this one. Go back to change your answer, or send it now.")}</p>
        )}
        {state.message && (
          <p className="text-sm text-coral-ink" role="alert">
            {t(state.message)}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        {step > 0 && (
          <button
            type="button"
            onClick={() => setStep((s) => s - 1)}
            className="min-h-11 rounded-control border border-slate/30 bg-white px-4 text-sm font-bold text-midnight hover:bg-cloud"
          >
            {t("Back")}
          </button>
        )}
        {step < 2 ? (
          // Separate keys: without them React reuses this <button> for the
          // Send button below and flips its type to "submit" during the
          // click, which sent the application straight from step 2.
          <button key="next" type="button" onClick={next} className="min-h-11 flex-1 rounded-control bg-primary px-4 text-sm font-extrabold text-white hover:bg-primary-hover">
            {step === 0 ? t("Looks right — continue") : t("Continue to step 3")}
          </button>
        ) : (
          <button
            key="send"
            type="submit"
            disabled={pending}
            className="min-h-11 flex-1 rounded-control bg-primary px-4 text-sm font-extrabold text-white hover:bg-primary-hover disabled:opacity-60"
          >
            {pending ? t("Submitting…") : t("Send application")}
          </button>
        )}
      </div>

      <p className="text-xs text-slate" role="status" aria-live="polite">
        {saveText ?? t("Your progress saves as you type. If your connection drops, continue from Applications.")}
      </p>
    </form>
  );
}
