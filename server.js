// Bit-Perfect Audio Detector report server. It only receives the app's anonymous report and forwards it by
// email (Resend); it stores nothing. Reports are reviewed and published by hand in the website's
// phone table.

import express from "express";
import { createHmac, randomBytes } from "node:crypto";
import { applyMarketingName, normalizeReport, ReportError } from "./src/report.js";
import { marketingName } from "./src/devices.js";
import { sendReportEmail } from "./src/email.js";
import { createLimiter, ipGroup } from "./src/limits.js";

const PORT = Number(process.env.PORT) || 3000;

// Key for hashing IPs: random on every start and never written anywhere. A plain hash of an IPv4
// address could be reversed by trying all 4.3 billion addresses; without this key it can't.
const IP_KEY = randomBytes(32);
const SITE_URL = (process.env.SITE_URL || "").replace(/\/$/, "");

const limiter = createLimiter();

const app = express();
// On Render a request goes through 3 proxies (Cloudflare, then two of Render's own), checked on
// 2026-10-17: X-Forwarded-For = "client, cloudflare, render". Trusting exactly 3 hops gives the IP
// Cloudflare saw, which the client can't fake (anything it adds to the header is further left).
app.set("trust proxy", 3);
app.disable("x-powered-by");

app.get("/healthz", (_req, res) => res.send("ok"));

app.post("/api/reports", express.json({ limit: "64kb" }), async (req, res) => {
  try {
    const report = normalizeReport(req.body);
    const ipKey = createHmac("sha256", IP_KEY).update(ipGroup(req.ip)).digest("hex").slice(0, 16);
    const allowed = limiter.take(ipKey);
    if (allowed === "ip") return res.status(429).json({ error: "At most two reports every 24 hours" });
    if (allowed === "daily") {
      // The header tells the app it's this limit and not Render's own 503 (service down).
      res.set("X-Report-Limit", "daily");
      return res.status(503).json({ error: "Too many reports today, try again tomorrow" });
    }
    let delivered = false;
    try {
      // Internal model code (e.g. Xiaomi "25113PN0EI") → commercial name ("Xiaomi 17").
      applyMarketingName(report, await marketingName(report.device.buildModel, report.device.device));
      delivered = await sendReportEmail(report);
    } catch (e) {
      console.error("[email]", e);
    }
    if (!delivered) {
      limiter.release(ipKey); // not delivered (Resend error, network failure or timeout): let them try again
      return res.status(502).json({ error: "Could not deliver the report" });
    }
    res.status(201).json({ ok: true });
  } catch (e) {
    if (e instanceof ReportError) return res.status(400).json({ error: e.message });
    console.error("[api/reports]", e);
    res.status(500).json({ error: "Internal error" });
  }
});

// Anyone opening this service in a browser is sent to the website.
app.get("/", (_req, res) => (SITE_URL ? res.redirect(302, SITE_URL) : res.send("Bit-Perfect Audio Detector report server")));

// Broken or too-large JSON and any other error: a short JSON answer, never the error's details
// (Express's default page shows the stack trace and the server's file paths).
app.use((err, _req, res, _next) => {
  const status = err.status >= 400 && err.status < 500 ? err.status : 500;
  if (status === 500) console.error("[server]", err);
  res.status(status).json({ error: status === 500 ? "Internal error" : "Invalid request" });
});

app.listen(PORT, () => console.log(`Report server listening on port ${PORT}`));
