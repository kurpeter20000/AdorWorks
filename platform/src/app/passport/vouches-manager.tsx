"use client";

import { useState, useTransition } from "react";
import { requestVouch } from "@/lib/actions/vouches";

export interface VouchRow {
  id: string;
  voucher_id: string;
  relationship: string;
  statement: string | null;
  status: "pending" | "confirmed" | "declined";
  created_at: string;
}

/**
 * 0107 — the talent-side half of vouches: request one, see where every
 * past request stands. The voucher's own side (confirm/decline) lives at
 * /vouches, since that page is addressed to whoever's being asked, not to
 * this account.
 */
export function VouchesManager({ items, voucherNames }: { items: VouchRow[]; voucherNames: Map<string, string | null> }) {
  const [email, setEmail] = useState("");
  const [relationship, setRelationship] = useState("");
  const [statement, setStatement] = useState("");
  const [status, setStatus] = useState<{ kind: "error" | "success"; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit() {
    setStatus(null);
    if (!email.trim() || !relationship.trim()) {
      setStatus({ kind: "error", message: "Enter their email and how you know them." });
      return;
    }
    const formData = new FormData();
    formData.set("email", email.trim());
    formData.set("relationship", relationship.trim());
    if (statement.trim()) formData.set("statement", statement.trim());

    startTransition(async () => {
      const result = await requestVouch({}, formData);
      if (result.message) {
        setStatus({ kind: "error", message: result.message });
        return;
      }
      setEmail("");
      setRelationship("");
      setStatement("");
      setStatus({ kind: "success", message: "Request sent — they'll get a notification and an email." });
    });
  }

  return (
    <div className="mt-4">
      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-lg border border-slate/15 bg-white p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-midnight">{voucherNames.get(item.voucher_id) ?? "Someone"}</p>
                  <p className="text-xs text-slate">{item.relationship}</p>
                </div>
                <span
                  className={`text-xs font-semibold ${
                    item.status === "confirmed" ? "text-teal-ink" : item.status === "declined" ? "text-coral-ink" : "text-slate"
                  }`}
                >
                  {item.status === "confirmed" ? "Confirmed" : item.status === "declined" ? "Declined" : "Waiting"}
                </span>
              </div>
              {item.statement && <p className="mt-1 text-xs text-slate">&ldquo;{item.statement}&rdquo;</p>}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 space-y-2 rounded-lg border border-slate/15 bg-cloud/40 p-3">
        <p className="text-xs text-slate">
          Ask someone who already has an AdorWorks account and knows you personally — a former colleague, a community
          leader, a past client — to vouch for you. They&apos;ll need to confirm before it shows on your profile.
        </p>
        <input
          type="email"
          placeholder="Their email (must already have an AdorWorks account)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
        <input
          placeholder="How do you know them? (e.g. Former colleague, Community leader)"
          value={relationship}
          onChange={(e) => setRelationship(e.target.value)}
          className="w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
        <textarea
          placeholder="Anything you'd like them to know, or that helps them write their vouch (optional)"
          rows={2}
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          className="w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
        {status && (
          <p className={`text-sm ${status.kind === "error" ? "text-coral-ink" : "text-teal-ink"}`} role={status.kind === "error" ? "alert" : "status"}>
            {status.message}
          </p>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={handleSubmit}
          className="w-full rounded-lg bg-teal px-4 py-2 text-sm font-bold text-midnight disabled:opacity-60"
        >
          {pending ? "Sending…" : "Ask for a vouch"}
        </button>
      </div>
    </div>
  );
}
