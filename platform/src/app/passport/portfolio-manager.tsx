"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { TalentPortfolioItemRow } from "@/lib/database.types";

export function PortfolioManager({ items }: { items: TalentPortfolioItemRow[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [status, setStatus] = useState<{ kind: "error" | "success"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleAdd() {
    setStatus(null);
    if (!title.trim()) {
      setStatus({ kind: "error", message: "Give this piece a title." });
      return;
    }
    if (!externalUrl.trim()) {
      setStatus({ kind: "error", message: "Add a link to the work." });
      return;
    }

    setBusy(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setStatus({ kind: "error", message: "Your session has expired — please sign in again." });
      setBusy(false);
      return;
    }

    const { error: insertError } = await supabase.from("talent_portfolio_items").insert({
      talent_id: user.id,
      title: title.trim(),
      description: description.trim() || null,
      external_url: externalUrl.trim(),
      image_url: imageUrl.trim() || null,
    });
    if (insertError) {
      setStatus({ kind: "error", message: `Could not save this item: ${insertError.message}` });
      setBusy(false);
      return;
    }

    setTitle("");
    setDescription("");
    setExternalUrl("");
    setImageUrl("");
    setBusy(false);
    setStatus({ kind: "success", message: "Added." });
    router.refresh();
  }

  // Pre-existing items from before portfolio went link-only may still carry
  // a file_path (talent-portfolio is a private bucket — migration 0065),
  // so this stays to let someone still view/finish migrating those off —
  // handleAdd above no longer offers uploading a new one.
  async function handleViewFile(path: string) {
    const supabase = createClient();
    const { data, error } = await supabase.storage.from("talent-portfolio").createSignedUrl(path, 300);
    if (error || !data) {
      setStatus({ kind: "error", message: "Couldn't open this file — try again." });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function handleDelete(id: string) {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from("talent_portfolio_items").delete().eq("id", id);
    setBusy(false);
    if (error) {
      setStatus({ kind: "error", message: `Could not remove this item: ${error.message}` });
      return;
    }
    router.refresh();
  }

  /**
   * Re-sequences every item's sort_order to its new display index, rather
   * than just swapping the two moved items' existing values — every item
   * defaults to sort_order 0 today (nothing has ever set it before this
   * feature), so a plain swap between two same-valued items would be a
   * silent no-op the first time anyone reorders anything.
   */
  async function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;

    const reordered = [...items];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

    setBusy(true);
    const supabase = createClient();
    const results = await Promise.all(
      reordered.map((item, i) => supabase.from("talent_portfolio_items").update({ sort_order: i }).eq("id", item.id))
    );
    setBusy(false);
    const failed = results.find((r) => r.error);
    if (failed) {
      setStatus({ kind: "error", message: `Could not reorder: ${failed.error?.message}` });
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-4">
      {items.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {items.map((item, index) => (
            <div key={item.id} className="overflow-hidden rounded-lg border border-slate/15 bg-white">
              <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden bg-cloud">
                {item.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- arbitrary talent-pasted URLs, not a local/known domain set for next/image.
                  <img src={item.image_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-9 text-slate/40" aria-hidden="true">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="m21 15-5-5L5 21" />
                  </svg>
                )}
              </div>
              <div className="p-3">
                <p className="text-sm font-semibold text-midnight">{item.title}</p>
                {item.description && <p className="mt-0.5 text-xs text-slate">{item.description}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  {item.external_url && (
                    <a href={item.external_url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-teal-ink underline">
                      View link
                    </a>
                  )}
                  {item.file_path && (
                    <button type="button" onClick={() => handleViewFile(item.file_path!)} className="text-xs font-semibold text-teal-ink underline">
                      View file
                    </button>
                  )}
                  <button type="button" disabled={busy} onClick={() => handleDelete(item.id)} className="text-xs font-semibold text-coral-ink disabled:opacity-60">
                    Remove
                  </button>
                  <div className="ms-auto flex gap-1">
                    <button type="button" disabled={busy || index === 0} onClick={() => handleMove(index, -1)} aria-label="Move up" className="text-xs text-slate disabled:opacity-30">
                      &uarr;
                    </button>
                    <button
                      type="button"
                      disabled={busy || index === items.length - 1}
                      onClick={() => handleMove(index, 1)}
                      aria-label="Move down"
                      className="text-xs text-slate disabled:opacity-30"
                    >
                      &darr;
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 space-y-2 rounded-lg border border-slate/15 bg-cloud/40 p-3">
        <input
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
        <textarea
          placeholder="Description (optional)"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
        <input
          placeholder="Link to the work (e.g. a live site, a Drive/Dropbox share, Behance, Dribbble)"
          value={externalUrl}
          onChange={(e) => setExternalUrl(e.target.value)}
          className="w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
        <input
          placeholder="Preview image link (optional — a screenshot or thumbnail makes this stand out)"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          className="w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
        {status && (
          <p className={`text-sm ${status.kind === "error" ? "text-coral-ink" : "text-teal-ink"}`} role={status.kind === "error" ? "alert" : "status"}>{status.message}</p>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={handleAdd}
          className="w-full rounded-lg bg-teal px-4 py-2 text-sm font-bold text-midnight disabled:opacity-60"
        >
          {busy ? "Saving…" : "Add to portfolio"}
        </button>
      </div>
    </div>
  );
}
