"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteService,
  pauseService,
  resumeService,
  reviseService,
  submitService,
  withdrawService,
} from "@/lib/actions/services";
import type { TalentServiceRow } from "@/lib/database.types";
import { CATEGORY_LABEL } from "@/lib/domain/taxonomy";
import { StatusBadge } from "@/components/status-badge";
import { TALENT_SERVICE_STATES } from "@/lib/domain/states";
import { ServiceForm } from "./service-form";

export function ServicesList({ services }: { services: TalentServiceRow[] }) {
  const router = useRouter();
  const [addingNew, setAddingNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runAction(id: string, action: (id: string) => Promise<{ error?: string }>) {
    setBusyId(id);
    setError(null);
    const result = await action(id);
    setBusyId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleDelete(id: string) {
    await runAction(id, deleteService);
  }

  return (
    <div className="mt-4">
      {services.length > 0 && (
        <ul className="space-y-2">
          {services.map((service) => (
            <li key={service.id} className="rounded-xl border border-slate/15 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-midnight">{service.title}</p>
                    <StatusBadge state={TALENT_SERVICE_STATES[service.status]} />
                  </div>
                  <p className="text-xs text-slate">
                    {[service.category ? CATEGORY_LABEL[service.category] : null, service.price ? `${service.price} ${service.currency}` : null]
                      .filter(Boolean)
                      .join(" · ") || "Draft — details not filled in yet"}
                  </p>
                  {service.status === "rejected" && service.status_note && (
                    <p className="mt-1 text-xs text-coral">Not approved: {service.status_note}</p>
                  )}
                  {service.status === "paused" && service.status_note && (
                    <p className="mt-1 text-xs text-slate">Paused: {service.status_note}</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewId(previewId === service.id ? null : service.id)}
                    className="text-xs font-semibold text-violet underline"
                  >
                    {previewId === service.id ? "Hide preview" : "Preview"}
                  </button>
                  {service.status === "draft" && (
                    <>
                      <button
                        type="button"
                        onClick={() => setEditingId(editingId === service.id ? null : service.id)}
                        className="text-xs font-semibold text-teal-ink underline"
                      >
                        {editingId === service.id ? "Close" : "Edit"}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === service.id}
                        onClick={() => runAction(service.id, submitService)}
                        className="text-xs font-semibold text-violet underline disabled:opacity-60"
                      >
                        Submit for review
                      </button>
                      <button
                        type="button"
                        disabled={busyId === service.id}
                        onClick={() => handleDelete(service.id)}
                        className="text-xs font-semibold text-coral disabled:opacity-60"
                      >
                        Delete
                      </button>
                    </>
                  )}
                  {(service.status === "rejected" || service.status === "published" || service.status === "paused") && (
                    <button
                      type="button"
                      disabled={busyId === service.id}
                      onClick={() => runAction(service.id, reviseService)}
                      className="text-xs font-semibold text-teal-ink underline disabled:opacity-60"
                    >
                      Revise
                    </button>
                  )}
                  {service.status === "published" && (
                    <button
                      type="button"
                      disabled={busyId === service.id}
                      onClick={() => runAction(service.id, pauseService)}
                      className="text-xs font-semibold text-slate underline disabled:opacity-60"
                    >
                      Pause
                    </button>
                  )}
                  {service.status === "paused" && (
                    <button
                      type="button"
                      disabled={busyId === service.id}
                      onClick={() => runAction(service.id, resumeService)}
                      className="text-xs font-semibold text-teal-ink underline disabled:opacity-60"
                    >
                      Resume
                    </button>
                  )}
                  {service.status !== "draft" && service.status !== "removed" && (
                    <button
                      type="button"
                      disabled={busyId === service.id}
                      onClick={() => runAction(service.id, withdrawService)}
                      className="text-xs font-semibold text-coral disabled:opacity-60"
                    >
                      Withdraw
                    </button>
                  )}
                </div>
              </div>
              {previewId === service.id && (
                <div className="mt-3 rounded-lg border border-slate/15 bg-cloud/40 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate">
                    Preview — how this looks on Browse Services
                  </p>
                  <div className="mt-2 flex items-start justify-between gap-4">
                    <p className="font-bold text-midnight">{service.title || "(untitled)"}</p>
                    <span className="whitespace-nowrap text-sm font-semibold text-teal-ink">
                      {service.price
                        ? `${service.currency || "SSP"} ${service.price.toLocaleString()}`
                        : service.payment_basis === "negotiable"
                          ? "Negotiable"
                          : "Price on request"}
                    </span>
                  </div>
                  {service.problem_solved && <p className="mt-2 text-sm text-slate">{service.problem_solved}</p>}
                  <p className="mt-3 text-xs text-slate">
                    {[service.category ? CATEGORY_LABEL[service.category] : null, service.turnaround]
                      .filter(Boolean)
                      .join(" · ") || "Not enough detail yet to preview fully."}
                  </p>
                </div>
              )}
              {editingId === service.id && (
                <ServiceForm existing={service} onSaved={() => setEditingId(null)} />
              )}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-2 text-sm text-coral">{error}</p>}

      {addingNew ? (
        <ServiceForm onSaved={() => setAddingNew(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setAddingNew(true)}
          className="mt-4 text-sm font-semibold text-teal-ink underline"
        >
          + Add a service
        </button>
      )}
    </div>
  );
}
