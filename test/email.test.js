import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeReport } from "../src/report.js";
import { sendReportEmail } from "../src/email.js";

const report = normalizeReport({
  schema: 1,
  device: { manufacturer: "Google", model: "Pixel 8", device: "shiba", android: "15", sdk: 35 },
});

test("without the Resend variables, a report is only printed in development", async (t) => {
  t.mock.method(console, "warn", () => {});
  assert.equal(await sendReportEmail(report, {}), true);
});

test("without the Resend variables in production, the report counts as not delivered", async (t) => {
  t.mock.method(console, "error", () => {});
  assert.equal(await sendReportEmail(report, { NODE_ENV: "production" }), false);
  assert.equal(await sendReportEmail(report, { NODE_ENV: "production", RESEND_API_KEY: "x" }), false);
});
