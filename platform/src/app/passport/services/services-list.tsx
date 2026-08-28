"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteService } from "@/lib/actions/services";
import type { TalentServiceRow } from "@/lib/database.types";
import { CATEGORY_LABEL } from "@/lib/domain/taxonomy";
import { ServiceForm } from "./service-form";

export function ServicesList({ services }: { services: TalentServiceRow[] }) {
  const router = useRouter();
  const [addingNew, setAddingNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(id: string) {
    setBusyId(id);
    setError(null);
    const result = await deleteService(id);
    setBusyId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-4">
      {services.length > 0 && (
        <ul className="space-y-2">
          {services.map((service) => (
            <li key={service.id} className="rounded-xl border border-slate/15 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-midnight">{service.title}</p>
                  <p className="text-xs text-slate">
                    {[service.category ? CATEGORY_LABEL[service.category] : null, service.price ? `${service.price} ${service.currency}` : null]
                      .filter(Boolean)
                      .join(" · ") || "Draft — details not filled in yet"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
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
                    onClick={() => handleDelete(service.id)}
                    className="text-xs font-semibold text-coral disabled:opacity-60"
                  >
                    Delete
                  </button>
                </div>
              </div>
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
