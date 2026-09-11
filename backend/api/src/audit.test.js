import { describe, it, expect, vi, beforeEach } from "vitest";
import { logAuditEvent } from "./audit.js";

function mockSupabase(insertImpl) {
  const insert = vi.fn(insertImpl);
  const from = vi.fn(() => ({ insert }));
  return { client: { from }, from, insert };
}

describe("logAuditEvent", () => {
  let errorSpy;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("inserts into audit_events with the expected shape, defaulting optional fields", async () => {
    const { client, from, insert } = mockSupabase(() => Promise.resolve({ error: null }));

    await logAuditEvent(client, {
      name: "case.dispute.resolved",
      actorId: "actor-1",
      entityType: "disputes",
      entityId: "dispute-1",
      before: { status: "open" },
      after: { status: "resolved" },
    });

    expect(from).toHaveBeenCalledWith("audit_events");
    expect(insert).toHaveBeenCalledWith({
      name: "case.dispute.resolved",
      actor_id: "actor-1",
      subject_id: null,
      entity_type: "disputes",
      entity_id: "dispute-1",
      reason: null,
      source: "staff_api",
      before: { status: "open" },
      after: { status: "resolved" },
      metadata: {},
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("passes through subjectId, reason and metadata when given", async () => {
    const { insert } = mockSupabase(() => Promise.resolve({ error: null }));

    await logAuditEvent({ from: () => ({ insert }) }, {
      name: "finance.record_created",
      actorId: "actor-1",
      subjectId: "talent-1",
      entityType: "finance_records",
      entityId: "record-1",
      reason: "manual deposit",
      metadata: { engagement_id: "eng-1" },
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        subject_id: "talent-1",
        reason: "manual deposit",
        metadata: { engagement_id: "eng-1" },
        before: null,
        after: null,
      })
    );
  });

  it("fails open (never throws) when the insert returns an error", async () => {
    const { client } = mockSupabase(() => Promise.resolve({ error: { message: "boom" } }));

    await expect(
      logAuditEvent(client, {
        name: "opportunity.rejected",
        actorId: "actor-1",
        entityType: "opportunities",
        entityId: "opp-1",
      })
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("audit_events insert failed for opportunity.rejected"), "boom");
  });

  it("fails open (never throws) when the client itself throws", async () => {
    const client = {
      from: () => {
        throw new Error("network down");
      },
    };

    await expect(
      logAuditEvent(client, {
        name: "payment.refund_issued",
        actorId: "actor-1",
        entityType: "finance_records",
        entityId: "record-1",
      })
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("audit_events insert threw for payment.refund_issued"),
      expect.any(Error)
    );
  });
});
