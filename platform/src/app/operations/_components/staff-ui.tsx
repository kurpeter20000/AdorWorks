"use client";

import { Fragment, useCallback, useEffect, useState, type ReactNode } from "react";
import { callStaffApi } from "@/lib/actions/staffApi";
import { signedStaffFileUrl } from "@/lib/actions/staffFiles";

/**
 * Shared building blocks for the /operations staff console — a React port
 * of the old static console's app.js helpers (apiFetch, statusBadge,
 * formatDate, expandable table rows) so each section page stays close to
 * the behaviour staff already know.
 */

/** Calls the staff API through the server; throws an Error with a staff-readable message on failure. */
export async function api<T = unknown>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const result = await callStaffApi<T>(options.method ?? "GET", path, options.body);
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

/**
 * Runs one of the platform's own Server Actions (those return
 * { message?, errors? } instead of throwing) and turns a failure into a
 * thrown Error so it plugs into useAction like api() does.
 */
export async function viaAction(result: Promise<{ message?: string; errors?: Record<string, string[] | undefined> }>) {
  const r = await result;
  const message = r.message ?? (r.errors ? Object.values(r.errors).flat().filter(Boolean).join(" ") : "");
  if (message) throw new Error(message);
}

export function formData(values: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

export function qs(params: Record<string, string | number | boolean | undefined | null>) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") usp.set(k, String(v));
  const s = usp.toString();
  return s ? `?${s}` : "";
}

/** Loads a staff API path; reloads whenever `path` changes. */
export function useStaffData<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag for a fetch this effect starts
    setLoading(true);
    api<T>(path)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, setData };
}

/** Runs one staff action at a time, with a shared success/error message. */
export function useAction(onDone?: () => void) {
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const run = useCallback(
    async (fn: () => Promise<unknown>, successMessage = "Saved.") => {
      setPending(true);
      setStatus(null);
      try {
        await fn();
        setStatus({ kind: "success", message: successMessage });
        onDone?.();
        return true;
      } catch (e) {
        setStatus({ kind: "error", message: (e as Error).message });
        return false;
      } finally {
        setPending(false);
      }
    },
    [onDone]
  );
  return { run, pending, status, setStatus };
}

export async function openStaffFile(bucket: string, path: string) {
  const result = await signedStaffFileUrl(bucket, path);
  if (!result.ok) throw new Error(result.error);
  window.open(result.url, "_blank", "noopener,noreferrer");
}

// --- formatting -----------------------------------------------------------

export function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

export function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function humanize(value: string | null | undefined) {
  return value ? value.replace(/_/g, " ") : "—";
}

export function money(amount: number | string | null | undefined, currency?: string | null) {
  if (amount === null || amount === undefined || amount === "") return "—";
  return `${currency ?? ""} ${Number(amount).toLocaleString("en-US")}`.trim();
}

// --- badges ---------------------------------------------------------------

type Tone = "neutral" | "info" | "warning" | "success" | "danger";
const TONE: Record<string, Tone> = {
  new: "info", in_review: "warning", converted: "success", archived: "neutral",
  pending: "warning", verified: "success", rejected: "danger", suspended: "danger",
  draft: "neutral", pending_review: "warning", open: "success", filled: "info", closed: "neutral", cancelled: "danger",
  changes_required: "warning", paused: "neutral", published: "success", removed: "neutral", expired: "neutral",
  submitted: "neutral", shortlisted: "info", interviewing: "info", offered: "warning", accepted: "success", withdrawn: "neutral",
  proposed: "neutral", contracted: "info", active: "success", completed: "success", disputed: "danger",
  approved: "success",
  registered: "neutral", identity_verified: "info", adorverified: "success", adorcertified: "success", team_lead: "success",
  investigating: "warning", resolved: "success", escalated: "danger", dismissed: "neutral", actioned: "success",
  confirmed: "success", reconciled: "success",
  revision_requested: "warning", paid: "success", sent: "info", declined: "danger",
  succeeded: "success", failed: "danger", refunded: "warning",
};
const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-slate/10 text-slate",
  info: "bg-violet/10 text-violet",
  warning: "bg-amber-100 text-amber-800",
  success: "bg-teal/10 text-teal-ink",
  danger: "bg-coral/10 text-coral-ink",
};

export function Badge({ value, tone }: { value: string | null | undefined; tone?: Tone }) {
  if (!value) return <span className="text-slate">—</span>;
  const t = tone ?? TONE[value] ?? "neutral";
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap capitalize ${TONE_CLASS[t]}`}>
      {humanize(value)}
    </span>
  );
}

// --- layout ---------------------------------------------------------------

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-extrabold text-midnight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-slate">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-midnight">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function SubHeading({ children }: { children: ReactNode }) {
  return <h3 className="mt-4 mb-1.5 text-sm font-bold text-midnight first:mt-0">{children}</h3>;
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "success"; children: ReactNode }) {
  const cls =
    tone === "error"
      ? "border-coral/40 bg-coral/5 text-coral-ink"
      : tone === "success"
        ? "border-teal/40 bg-teal/5 text-teal-ink"
        : "border-slate/20 bg-cloud text-slate";
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-sm ${cls}`}>
      {children}
    </div>
  );
}

export function ActionStatus({ status }: { status: { kind: "success" | "error"; message: string } | null }) {
  if (!status) return null;
  return (
    <div className="mt-3">
      <Notice tone={status.kind === "error" ? "error" : "success"}>{status.message}</Notice>
    </div>
  );
}

export function KV({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-1.5 text-sm">
      {items.map(([k, v]) => (
        <Fragment key={k}>
          <dt className="font-semibold text-slate">{k}</dt>
          <dd className="min-w-0 break-words text-midnight">{v ?? "—"}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

export function Timeline({ items, empty }: { items: { key: string; when?: string | null; body: ReactNode }[]; empty: string }) {
  if (!items.length) return <p className="text-sm text-slate">{empty}</p>;
  return (
    <ul className="space-y-2 border-l-2 border-slate/15 pl-3 text-sm">
      {items.map((i) => (
        <li key={i.key}>
          {i.when && <time className="block text-xs text-slate">{fmtDateTime(i.when)}</time>}
          <div className="text-midnight">{i.body}</div>
        </li>
      ))}
    </ul>
  );
}

// --- controls -------------------------------------------------------------

const BTN = {
  primary: "bg-teal text-midnight hover:bg-teal/90",
  secondary: "border border-slate/25 bg-white text-midnight hover:border-teal",
  danger: "border border-coral/40 bg-white text-coral-ink hover:bg-coral/5",
};

export function Btn({
  variant = "secondary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BTN }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex min-h-9 items-center justify-center rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${BTN[variant]} ${className}`}
    />
  );
}

export const inputClass =
  "w-full min-w-0 rounded-lg border border-slate/25 bg-white px-3 py-2 text-sm text-midnight focus:border-teal focus:outline-none";

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-semibold text-midnight">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate">{hint}</span>}
    </label>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="mb-4 grid gap-2 sm:flex sm:flex-wrap sm:items-center [&>*]:sm:w-auto">{children}</div>;
}

/** Toggle chips for a single status filter ("" = All). */
export function Chips({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly [string, string][];
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map(([v, l]) => (
        <button
          key={v || "all"}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
            value === v ? "border-teal bg-teal/10 text-teal-ink" : "border-slate/25 bg-white text-slate hover:border-teal"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export function Select({
  value,
  onChange,
  options,
  placeholder,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly (string | [string, string])[];
  placeholder?: string;
  label: string;
}) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass} sm:w-auto`}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => {
        const [v, l] = Array.isArray(o) ? o : [o, humanize(o)];
        return (
          <option key={v} value={v}>
            {l}
          </option>
        );
      })}
    </select>
  );
}

/** A reason box + button pair (reject/decline flows that require a written reason). */
export function ReasonAction({
  label,
  placeholder = "Reason (required)",
  onSubmit,
  disabled,
  variant = "danger",
}: {
  label: string;
  placeholder?: string;
  onSubmit: (reason: string) => void;
  disabled?: boolean;
  variant?: keyof typeof BTN;
}) {
  const [reason, setReason] = useState("");
  return (
    <div className="flex w-full flex-col gap-2 sm:flex-row">
      <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      <Btn variant={variant} disabled={disabled || !reason.trim()} onClick={() => onSubmit(reason.trim())}>
        {label}
      </Btn>
    </div>
  );
}

// --- tables ---------------------------------------------------------------

/**
 * A table whose rows expand in place to show a detail panel — same
 * interaction as the old console. On phones it becomes stacked cards so
 * nothing needs sideways scrolling.
 */
export function StaffTable<T>({
  columns,
  rows,
  rowKey,
  cells,
  detail,
  loading,
  error,
  empty,
  onRetry,
}: {
  columns: string[];
  rows: T[] | null;
  rowKey: (row: T) => string;
  cells: (row: T) => ReactNode[];
  detail?: (row: T, close: () => void) => ReactNode;
  loading?: boolean;
  error?: string | null;
  empty: string;
  onRetry?: () => void;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  let status: ReactNode = null;
  if (error)
    status = (
      <span>
        {error}{" "}
        {onRetry && (
          <button type="button" onClick={onRetry} className="font-semibold text-teal-ink underline">
            Retry
          </button>
        )}
      </span>
    );
  else if (loading && !rows) status = "Loading…";
  else if (rows && !rows.length) status = empty;

  return (
    <div className="overflow-hidden rounded-xl border border-slate/15 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="hidden bg-cloud text-xs font-bold tracking-wide text-slate uppercase md:table-header-group">
          <tr>
            {columns.map((c) => (
              <th key={c} className="px-4 py-2.5">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {status ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-6 text-center text-slate">
                {status}
              </td>
            </tr>
          ) : (
            rows!.map((row) => {
              const key = rowKey(row);
              const open = openKey === key;
              const rowCells = cells(row);
              return (
                <Fragment key={key}>
                  <tr
                    onClick={detail ? () => setOpenKey(open ? null : key) : undefined}
                    onKeyDown={
                      detail
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setOpenKey(open ? null : key);
                            }
                          }
                        : undefined
                    }
                    tabIndex={detail ? 0 : undefined}
                    aria-expanded={detail ? open : undefined}
                    className={`block border-t border-slate/10 p-3 first:border-t-0 md:table-row md:p-0 ${detail ? "cursor-pointer hover:bg-cloud/60 focus-visible:bg-cloud focus-visible:outline-none" : ""} ${open ? "bg-cloud/60" : ""}`}
                  >
                    {rowCells.map((cell, i) => (
                      <td key={i} className="flex gap-2 py-0.5 md:table-cell md:px-4 md:py-3">
                        <span className="w-28 shrink-0 text-xs font-semibold text-slate md:hidden">{columns[i]}</span>
                        <span className="min-w-0 break-words">{cell}</span>
                      </td>
                    ))}
                  </tr>
                  {detail && open && (
                    <tr className="block md:table-row">
                      <td colSpan={columns.length} className="block border-t border-slate/10 bg-cloud/40 p-4 md:table-cell">
                        {detail(row, () => setOpenKey(null))}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Loads one record for an expanded row and renders it; `children` gets the data plus a reload. */
export function DetailLoader<T>({ path, children }: { path: string; children: (data: T, reload: () => void) => ReactNode }) {
  const { data, error, loading, reload } = useStaffData<T>(path);
  if (error) return <Notice tone="error">{error}</Notice>;
  if (loading && !data) return <p className="text-sm text-slate">Loading…</p>;
  if (!data) return null;
  return <>{children(data, reload)}</>;
}

export function ActionRow({ children }: { children: ReactNode }) {
  return <div className="mt-3 flex flex-wrap items-center gap-2">{children}</div>;
}

export function Grid2({ children }: { children: ReactNode }) {
  return <div className="grid gap-6 lg:grid-cols-2">{children}</div>;
}
