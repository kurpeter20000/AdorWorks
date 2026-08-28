"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { TalentPortfolioItemRow } from "@/lib/database.types";

const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

function getPortfolioFileUrl(path: string) {
  return createClient().storage.from("talent-portfolio").getPublicUrl(path).data.publicUrl;
}

export function PortfolioManager({ items }: { items: TalentPortfolioItemRow[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<{ kind: "error" | "success"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleAdd() {
    setStatus(null);
    if (!title.trim()) {
      setStatus({ kind: "error", message: "Give this piece a title." });
      return;
    }
    if (!externalUrl.trim() && !file) {
      setStatus({ kind: "error", message: "Add a link or upload a file." });
      return;
    }
    if (file && !ALLOWED_TYPES.includes(file.type)) {
      setStatus({ kind: "error", message: "Please upload a JPG, PNG, WebP image, or a PDF (e.g. your CV)." });
      return;
    }
    if (file && file.size > MAX_SIZE_BYTES) {
      setStatus({ kind: "error", message: "File is too large — 8MB maximum." });
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

    let filePath: string | null = null;
    if (file) {
      const path = `${user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: uploadError } = await supabase.storage.from("talent-portfolio").upload(path, file, {
        upsert: false,
      });
      if (uploadError) {
        setStatus({ kind: "error", message: `Upload failed: ${uploadError.message}` });
        setBusy(false);
        return;
      }
      filePath = path;
    }

    const { error: insertError } = await supabase.from("talent_portfolio_items").insert({
      talent_id: user.id,
      title: title.trim(),
      description: description.trim() || null,
      external_url: externalUrl.trim() || null,
      file_path: filePath,
    });
    if (insertError) {
      setStatus({ kind: "error", message: `Could not save this item: ${insertError.message}` });
      setBusy(false);
      return;
    }

    setTitle("");
    setDescription("");
    setExternalUrl("");
    setFile(null);
    setBusy(false);
    setStatus({ kind: "success", message: "Added." });
    router.refresh();
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
        <ul className="space-y-2">
          {items.map((item, index) => (
            <li
              key={item.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-slate/15 bg-white p-3"
            >
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  disabled={busy || index === 0}
                  onClick={() => handleMove(index, -1)}
                  aria-label="Move up"
                  className="text-xs text-slate disabled:opacity-30"
                >
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
              <div className="flex-1">
                <p className="text-sm font-semibold text-midnight">{item.title}</p>
                {item.description && <p className="text-xs text-slate">{item.description}</p>}
                {item.external_url && (
                  <a
                    href={item.external_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-semibold text-teal-ink underline"
                  >
                    View link
                  </a>
                )}
                {item.file_path && (
                  <a
                    href={getPortfolioFileUrl(item.file_path)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-semibold text-teal-ink underline"
                  >
                    View file
                  </a>
                )}
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => handleDelete(item.id)}
                className="text-xs font-semibold text-coral disabled:opacity-60"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
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
          placeholder="Link to the work (optional)"
          value={externalUrl}
          onChange={(e) => setExternalUrl(e.target.value)}
          className="w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="w-full text-sm"
        />
        {status && (
          <p className={`text-sm ${status.kind === "error" ? "text-coral" : "text-teal-ink"}`}>{status.message}</p>
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
