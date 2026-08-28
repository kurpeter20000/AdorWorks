import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";

import { intakeRouter } from "./routes/intake.js";
import { talentRouter } from "./routes/talent.js";
import { organisationsRouter } from "./routes/organisations.js";
import { opportunitiesRouter } from "./routes/opportunities.js";
import { talentServicesRouter } from "./routes/talentServices.js";
import { applicationsRouter } from "./routes/applications.js";
import { engagementsRouter } from "./routes/engagements.js";
import { contractsRouter } from "./routes/contracts.js";
import { financeRouter } from "./routes/finance.js";
import { reviewsRouter } from "./routes/reviews.js";
import { disputesRouter } from "./routes/disputes.js";
import { assistedOnboardingRouter } from "./routes/assistedOnboarding.js";
import { peopleRouter } from "./routes/people.js";

const app = express();

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      // Allow same-origin/non-browser requests (no Origin header) and
      // anything explicitly listed in ALLOWED_ORIGINS.
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`Origin ${origin} is not allowed.`));
    },
  })
);
app.use(express.json({ limit: "1mb" }));

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/api/intake", intakeRouter);
app.use("/api/talent", talentRouter);
app.use("/api/organisations", organisationsRouter);
app.use("/api/opportunities", opportunitiesRouter);
app.use("/api/talent-services", talentServicesRouter);
app.use("/api/applications", applicationsRouter);
app.use("/api/engagements", engagementsRouter);
app.use("/api/contracts", contractsRouter);
app.use("/api/finance", financeRouter);
app.use("/api/reviews", reviewsRouter);
app.use("/api/disputes", disputesRouter);
app.use("/api/assisted-onboarding", assistedOnboardingRouter);
app.use("/api/people", peopleRouter);

app.use((req, res) => {
  res.status(404).json({ error: "Not found." });
});

// Centralized error handler — every route uses asyncRoute() to funnel
// thrown errors here instead of leaking a raw stack trace to the client.
app.use((err, req, res, next) => {
  if (err?.name === "ZodError") {
    return res.status(422).json({ error: "Invalid request.", details: err.issues });
  }
  const status = err?.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err?.message || "Internal server error." });
});

const port = process.env.PORT || 8787;
app.listen(port, () => {
  console.log(`AdorWorks API listening on :${port}`);
});
