import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { asyncRoute, HttpError } from "../asyncRoute.js";

/**
 * The marketing site's AI chat widget (js/chat-widget.js) — the first
 * genuinely public (unauthenticated) route in this API. Every other
 * router here requires a signed-in staff account (see middleware/auth.js
 * and each router's own `.use(requireAuth, requireStaff)`); this one
 * deliberately has no auth at all, since a site visitor asking "how does
 * verification work?" has no account yet. Rate-limited by IP instead
 * (check_rate_limit, same RPC platform/src/lib/domain/rateLimit.ts uses
 * for login/signup/etc. — migration 0090's atomic, table-backed
 * version, not an in-memory counter, since Render can in principle run
 * more than one instance).
 */
export const publicChatRouter = Router();

const RATE_LIMIT = { windowMinutes: 15, maxAttempts: 20 };

function clientIp(req) {
  // app.js sets `trust proxy` — req.ip then already resolves through
  // Render's X-Forwarded-For to the real visitor IP, not Render's own
  // internal proxy address. Falls back to the raw socket address for
  // local dev, where there's no proxy in front at all.
  return req.ip || req.socket?.remoteAddress || "unknown";
}

async function checkRateLimit(identifier) {
  try {
    const { data: allowed, error } = await supabaseAdmin.rpc("check_rate_limit", {
      p_action: "public_chat",
      p_identifier: identifier,
      p_window_minutes: RATE_LIMIT.windowMinutes,
      p_max_attempts: RATE_LIMIT.maxAttempts,
    });
    if (error) throw error;
    return allowed ?? true;
  } catch (err) {
    // Fails open, same reasoning as rateLimit.ts: a broken rate-limit
    // check must never be the thing that takes the whole chat widget
    // down for every visitor.
    console.error("public_chat rate limit check failed, failing open:", err.message);
    return true;
  }
}

/**
 * Grounded in the site's own already-reviewed copy (help.html,
 * trust-safety.html, pricing.html) rather than invented — the careful
 * wording there (e.g. "does not describe client funds as escrow") is
 * load-bearing, not decorative, and the bot must not contradict it.
 */
const SYSTEM_PROMPT = `You are the AdorWorks support assistant, embedded as a chat widget on the AdorWorks public website (adorworks.pages.dev). AdorWorks is a South Sudan-born talent and work marketplace, built by Adormedia, connecting talent (freelancers, contractors, full-time hires) with employers.

Answer only using the facts below. If something isn't covered here, say you're not sure and offer to connect the visitor with a human (they can ask you to "talk to a human" or use the escalation option in the widget) — never invent an answer, a price, a policy, or a feature that isn't listed here.

FACTS ABOUT ADORWORKS:

Registration and cost:
- Registration is completely free for talent, always. AdorWorks never charges a jobseeker a fee to be considered for work (this follows ILO fair-recruitment guidance against recruitment fees charged to workers).
- AdorWorks currently charges a 0% platform fee overall, during its founding pilot. A pricing model for later is being tested but nothing is deducted from any payment today.
- Enterprise/framework pricing (NGOs, larger companies, recurring needs like talent squads or contractor-of-record support) is handled as a custom arrangement, not a per-project fee.

Verification tiers for talent (each one is a real check, not just an automated score):
1. Registered
2. Identity verified
3. AdorVerified — portfolio and references checked
4. AdorCertified — a practical skills assessment
A higher tier means more was checked, not that a lower tier is unchecked.

Employer verification covers: organisation registration/credible evidence of operations, a verified representative with real decision-making authority, corporate email/phone verification, a clear role/scope/budget/workplace before matching, agreement to fair hiring and payment terms, and enhanced review for higher-risk placements (overseas, relocation, field safety, vulnerable groups).

Payments and escrow:
- AdorWorks does NOT currently hold client funds in escrow and does not describe any arrangement as escrow. No licensed local payment partner has been confirmed yet.
- Engagements are currently scoped and invoiced directly while that is being finalized.
- Milestone-based payment tracking exists in the platform for confirmed engagements; live third-party payment processing (mobile money, bank transfer) depends on the payment-partner question being resolved.

If something goes wrong on an engagement:
1. The affected milestone is paused and both parties are acknowledged.
2. AdorWorks staff review the brief, contract, messages, files, approvals and timeline.
3. Staff attempt facilitated resolution — correction, a revised milestone, partial acceptance, or replacement.
4. Material fraud, safety, harassment or legal concerns are escalated to AdorWorks leadership.
5. The outcome is recorded and the underlying policy is improved.
Every engagement has a named AdorWorks contact, and disputes are mediated by staff, not left between the two parties alone.

AdorWorks is staff-assisted by default for both employers and talent — you don't have to run the whole hiring/job-search process yourself. In-person help is available for talent who need it getting online (see the Assisted Hiring page).

Legal/regulatory status: South Sudan's Labour Act contains licensing provisions for private employment agencies. AdorWorks is confirming applicable licensing before offering full-time placement or cross-border recruitment at scale. This pilot-stage operation is being reviewed with qualified counsel as registrations are confirmed.

How to get started:
- Sign up: https://ador-works.vercel.app/signup
- Sign in: https://ador-works.vercel.app/login
- For a hiring-specific FAQ, point employers to the For Employers page; for verification detail, point talent to the For Talent page.

Report a concern: use the Contact page and choose "Trust & Safety concern" — mark any immediate risk clearly.

STYLE: Be concise, warm, and plain-spoken — a sentence or two per answer unless more detail is genuinely needed. Never claim functionality AdorWorks doesn't have (e.g. don't say payments are processed automatically, don't say escrow exists, don't invent a fee percentage). If asked something outside these facts (legal advice, specific account issues, anything requiring real account access), say you can't help with that directly and offer to connect them with a human.`;

const ChatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(2000),
      })
    )
    .min(1)
    .max(20),
});

// POST /api/public/chat
publicChatRouter.post(
  "/chat",
  asyncRoute(async (req, res) => {
    const allowed = await checkRateLimit(clientIp(req));
    if (!allowed) throw new HttpError(429, "Too many messages — please wait a few minutes and try again.");

    const body = ChatSchema.parse(req.body);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new HttpError(503, "The chat assistant isn't configured yet — please use the contact form instead.");
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: body.messages,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(`Anthropic API error (${response.status}):`, detail);
      throw new HttpError(502, "The chat assistant is temporarily unavailable — please try again shortly.");
    }

    const data = await response.json();
    const reply = (data.content ?? []).find((block) => block.type === "text")?.text ?? "";
    res.json({ reply });
  })
);

const EscalateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email(),
  message: z.string().trim().min(1).max(2000),
  transcript: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .max(20)
    .optional()
    .default([]),
});

// POST /api/public/chat/escalate — "talk to a human" from the widget.
// Lands in the same intake_submissions queue staff already review for
// every other public-site form (contact.html etc.) rather than a new
// table/inbox — same pattern, new form_type (0103).
publicChatRouter.post(
  "/chat/escalate",
  asyncRoute(async (req, res) => {
    const allowed = await checkRateLimit(clientIp(req));
    if (!allowed) throw new HttpError(429, "Too many requests — please wait a few minutes and try again.");

    const body = EscalateSchema.parse(req.body);

    const { error } = await supabaseAdmin.from("intake_submissions").insert({
      form_type: "chatbot_escalation",
      payload: { name: body.name, email: body.email, message: body.message, transcript: body.transcript },
    });
    if (error) throw new HttpError(500, error.message);

    res.json({ ok: true });
  })
);
