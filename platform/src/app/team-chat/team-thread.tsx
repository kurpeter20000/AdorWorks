"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Send, ShieldCheck, UserRound } from "lucide-react";
import { hideTeamMessage, markThreadRead, postTeamMessage } from "@/lib/actions/teamChat";
import type { ThreadDetail } from "@/lib/dal/teamChat";
import { useRealtimeTeamThread } from "@/lib/hooks/useRealtimeTeamThread";
import { useT } from "@/i18n/client";
import { channelLabel } from "./labels";

const dayKey = (iso: string) => iso.slice(0, 10);

function TimeText({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
    </time>
  );
}

function DayText({ iso }: { iso: string }) {
  return (
    <span suppressHydrationWarning>{new Date(iso).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}</span>
  );
}

/**
 * One team chat thread (0127): live messages, day separators, sender
 * names grouped like a messaging app, shared-candidate cards, moderator
 * "remove", and a composer (Enter sends, Shift+Enter adds a line).
 */
export function TeamThread({ detail, me }: { detail: ThreadDetail; me: string }) {
  const t = useT();
  const kind = detail.kind;
  const id = detail.key.slice(2);
  const [messages, setMessages] = useRealtimeTeamThread({ kind, id }, detail.messages, detail.people);
  const [text, setText] = useState("");
  const [share, setShare] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  // Stay pinned to the newest message.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  // Mark as read on open and as new messages arrive while it's on screen.
  useEffect(() => {
    if (document.visibilityState !== "visible") return;
    const timer = setTimeout(() => void markThreadRead(detail.key), 600);
    return () => clearTimeout(timer);
  }, [detail.key, messages.length]);

  // Grow the box with its text, up to about six lines.
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const send = () => {
    const body = text.trim();
    if (!body || pending) return;
    setError(null);
    start(async () => {
      const r = await postTeamMessage(detail.key, body, share || null);
      if (r.error) {
        setError(r.error);
        return;
      }
      setText("");
      setShare("");
      if (r.message) {
        const m = r.message;
        setMessages((prev) =>
          prev.some((x) => x.id === m.id) ? prev : [...prev, { id: m.id, senderId: m.senderId, body: m.body, createdAt: m.createdAt, hidden: false, candidate: null }]
        );
      }
    });
  };

  const remove = (messageId: string) =>
    start(async () => {
      const r = await hideTeamMessage(messageId);
      if (r.error) setError(r.error);
      else setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, hidden: true, body: "", candidate: null } : m)));
    });

  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="flex items-start gap-3 border-b border-line px-4 py-3">
        <Link href="/team-chat" className="-ms-1 mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-midnight hover:bg-cloud md:hidden" aria-label={t("All conversations")}>
          <ArrowLeft className="size-5 rtl:rotate-180" aria-hidden />
        </Link>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-extrabold text-midnight">
            {kind === "application" ? <span className="no-i18n">{detail.title}</span> : channelLabel(detail.title, t)}
          </h2>
          {(detail.context || detail.subtitle) && (
            <p className="text-xs text-pretty text-slate">
              {detail.context && (
                <span className="no-i18n">
                  {kind === "application" ? `${t("Applied for")} ` : ""}
                  {detail.context}
                </span>
              )}
              {detail.context && detail.subtitle && " · "}
              {detail.subtitle && (kind === "application" ? <span className="no-i18n">{detail.subtitle}</span> : channelLabel(detail.subtitle, t))}
            </p>
          )}
        </div>
        {detail.href && (
          <Link href={detail.href} className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs font-bold text-midnight hover:border-primary">
            {kind === "application" ? t("Open applicant") : t("Open cohort")}
          </Link>
        )}
      </header>

      {detail.safeguarded && (
        <p className="flex items-start gap-2 border-b border-line bg-cloud px-4 py-2 text-xs text-pretty text-slate">
          <ShieldCheck className="mt-px size-4 shrink-0 text-teal-ink" aria-hidden />
          {t("A group chat for the whole cohort. AdorWorks can see it to keep everyone safe, and phone numbers and emails can't be shared here.")}
        </p>
      )}
      {kind === "application" && (
        <p className="border-b border-line bg-cloud px-4 py-2 text-xs text-pretty text-slate">
          {t("Only your team can see this discussion — never the applicant. It's the same as the team notes on their application.")}
        </p>
      )}

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-4" aria-live="polite">
        {messages.length === 0 ? (
          <p className="mx-auto mt-10 max-w-sm text-center text-sm text-pretty text-slate">{t("No messages yet. Say hello to get the conversation going.")}</p>
        ) : (
          <ol className="space-y-1">
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
              const grouped = !newDay && prev && prev.senderId === m.senderId && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000;
              const mine = m.senderId === me;
              const person = detail.people[m.senderId];
              return (
                <li key={m.id}>
                  {newDay && (
                    <div className="my-3 flex items-center gap-3 text-[11px] font-semibold text-slate">
                      <span className="h-px flex-1 bg-line" />
                      <DayText iso={m.createdAt} />
                      <span className="h-px flex-1 bg-line" />
                    </div>
                  )}
                  <div className={`flex ${mine ? "justify-end" : "justify-start"} ${grouped ? "" : "mt-2"}`}>
                    <div className={`max-w-[85%] sm:max-w-[75%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
                      {!grouped && (
                        <p className={`mb-0.5 flex items-center gap-1.5 px-1 text-xs ${mine ? "flex-row-reverse" : ""}`}>
                          <span className="font-bold text-midnight no-i18n">{mine ? t("You") : person?.name ?? t("Someone")}</span>
                          {person?.badge && <span className="rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-bold text-teal-ink">{person.badge}</span>}
                          <span className="text-slate">
                            <TimeText iso={m.createdAt} />
                          </span>
                        </p>
                      )}
                      {m.hidden ? (
                        <p className="rounded-2xl border border-dashed border-line px-3 py-2 text-xs text-slate italic">{t("Message removed by a moderator")}</p>
                      ) : (
                        <div
                          className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed text-pretty whitespace-pre-wrap [overflow-wrap:anywhere] ${
                            mine ? "rounded-ee-md bg-primary text-white" : "rounded-es-md border border-line bg-white text-midnight"
                          }`}
                        >
                          <span className="no-i18n">{m.body}</span>
                          {m.candidate && (
                            <Link
                              href={m.candidate.href}
                              className={`mt-2 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${mine ? "bg-white/15 text-white" : "bg-cloud text-midnight"}`}
                            >
                              <UserRound className="size-4 shrink-0" aria-hidden />
                              <span className="min-w-0">
                                <span className="block font-bold no-i18n">{m.candidate.name}</span>
                                <span className="block opacity-80">
                                  {t("Applied for")} <span className="no-i18n">{m.candidate.job}</span>
                                </span>
                              </span>
                            </Link>
                          )}
                        </div>
                      )}
                      {detail.canModerate && !m.hidden && !mine && (
                        <button type="button" onClick={() => remove(m.id)} disabled={pending} className="mt-0.5 px-1 text-[11px] font-semibold text-slate hover:text-coral-ink">
                          {t("Remove")}
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {detail.canPost ? (
        <form
          className="border-t border-line bg-white px-3 py-3 sm:px-4"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          {detail.shareableCandidates.length > 0 && (
            <label className="mb-2 flex items-center gap-2 text-xs text-slate">
              <UserRound className="size-4 shrink-0" aria-hidden />
              <span className="sr-only">{t("Share a candidate")}</span>
              <select value={share} onChange={(e) => setShare(e.target.value)} className="min-h-9 w-full min-w-0 rounded-lg border border-slate/25 bg-white px-2 text-xs text-midnight">
                <option value="">{t("Share a candidate with this message (optional)")}</option>
                {detail.shareableCandidates.map((c) => (
                  <option key={c.applicationId} value={c.applicationId}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex items-end gap-2">
            <label className="sr-only" htmlFor="team-chat-box">
              {t("Message")}
            </label>
            <textarea
              id="team-chat-box"
              ref={boxRef}
              rows={1}
              value={text}
              maxLength={4000}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={kind === "application" ? t("Add a note for your team…") : t("Write a message…")}
              className="max-h-40 min-h-11 flex-1 resize-none rounded-2xl border border-slate/25 px-3.5 py-2.5 text-sm text-midnight focus:border-primary focus:outline-none"
            />
            <button
              type="submit"
              disabled={pending || !text.trim()}
              aria-label={t("Send")}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-white hover:bg-primary-hover disabled:opacity-40"
            >
              <Send className="size-5 rtl:-scale-x-100" aria-hidden />
            </button>
          </div>
          {error && (
            <p className="mt-2 text-xs text-coral-ink" role="alert">
              {t(error)}
            </p>
          )}
        </form>
      ) : (
        <p className="border-t border-line px-4 py-3 text-xs text-slate">{t("You can read this conversation but not post in it.")}</p>
      )}
    </section>
  );
}
