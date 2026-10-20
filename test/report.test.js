import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeReport, publishedEntry, publishedEntryText, ReportError } from "../src/report.js";

const base = {
  schema: 1,
  appVersion: "1.0",
  device: { manufacturer: "Google", model: "Pixel 8", device: "shiba", android: "15", sdk: 35 },
  noDac: { maxRate: 192000, maxBits: 24, dynamic: true, bitPerfectDeclared: true },
  dac: null,
  bitPerfect: "manufacturer",
  compatibleApps: ["Symfonium"],
  summary: "summary",
  technical: "technical",
};

test("normalizes a valid report", () => {
  const r = normalizeReport(base, 1000);
  assert.equal(r.receivedAt, 1000);
  assert.equal(r.device.model, "Pixel 8");
  assert.equal(r.noDac.maxRate, 192000);
  assert.equal(r.dac, null);
  assert.ok(r.id);
});

test("rejects an unknown schema or a report without a model", () => {
  assert.throws(() => normalizeReport({ ...base, schema: 2 }), ReportError);
  assert.throws(() => normalizeReport({ ...base, device: { manufacturer: "X" } }), ReportError);
  assert.throws(() => normalizeReport(null), ReportError);
});

test("rejects reports from emulators (e.g. Google Play's pre-launch report)", () => {
  const emulators = [
    { manufacturer: "Google", model: "sdk_gphone64_arm64", device: "emu64a" },
    { manufacturer: "Google", model: "sdk_gphone64_x86_64", device: "emu64xa" },
    { manufacturer: "unknown", model: "Android SDK built for x86", device: "generic_x86" },
    { manufacturer: "Genymotion", model: "Pixel 3", device: "vbox86p" },
  ];
  for (const d of emulators) {
    assert.throws(() => normalizeReport({ ...base, device: { ...d, android: "15", sdk: 35 } }), ReportError, d.model);
  }
  // Real phones whose names look a bit like those codes still pass.
  const phones = [
    { manufacturer: "Google", model: "Pixel 8", device: "shiba" },
    { manufacturer: "Xiaomi", model: "25113PN0EI", device: "pudding" },
    { manufacturer: "samsung", model: "SM-S921B", device: "e1s" },
    { manufacturer: "motorola", model: "motorola edge 50 neo", device: "cancunf" },
  ];
  for (const d of phones) {
    assert.doesNotThrow(() => normalizeReport({ ...base, device: { ...d, android: "15", sdk: 35 } }), d.model);
  }
});

test("drops out-of-range values and unknown states", () => {
  const r = normalizeReport({ ...base, noDac: { maxRate: -5, maxBits: 999 }, bitPerfect: "hack" });
  assert.equal(r.noDac.maxRate, 0);
  assert.equal(r.noDac.maxBits, 0);
  assert.equal(r.bitPerfect, "unknown");
});

test("the entry to publish is valid JSON and only has what gets published", () => {
  const r = normalizeReport({ ...base, dac: { name: "FiiO KA1", maxRate: 384000, maxBits: 32, bitPerfect: true } },
    Date.parse("2026-10-17T10:00:00Z"));
  const parsed = JSON.parse(publishedEntryText(r));
  assert.deepEqual(parsed, publishedEntry(r));
  assert.deepEqual(Object.keys(parsed), ["date", "manufacturer", "model", "android", "bitPerfect", "noDac", "dac", "apps"]);
  assert.equal(parsed.date, "2026-10-17");
  assert.deepEqual(parsed.dac, { name: "FiiO KA1", maxRate: 384000, maxBits: 32, bitPerfect: true });
});

test("publishes the firmware and the DAC's USB Audio Class when the app sends them", () => {
  const r = normalizeReport({
    ...base,
    device: { ...base.device, firmware: "BP2A.250605.031 (A175FXXU1AYG1)" },
    dac: { name: "HiBy FC3", uac: "UAC2", maxRate: 192000, maxBits: 32, bitPerfect: false },
  });
  const entry = publishedEntry(r);
  assert.deepEqual(Object.keys(entry),
    ["date", "manufacturer", "model", "android", "firmware", "bitPerfect", "noDac", "dac", "apps"]);
  assert.equal(entry.firmware, "BP2A.250605.031 (A175FXXU1AYG1)");
  assert.deepEqual(entry.dac, { name: "HiBy FC3", uac: "UAC2", maxRate: 192000, maxBits: 32, bitPerfect: false });
  // Anything else in uac is dropped.
  assert.equal(normalizeReport({ ...base, dac: { name: "X", uac: "<b>UAC9</b>" } }).dac.uac, null);
});

test("removes the repeated brand from the model when the report arrives", () => {
  const r = normalizeReport({ ...base, device: { manufacturer: "motorola", model: "motorola edge 50 neo" } });
  assert.equal(r.device.manufacturer, "Motorola");
  assert.equal(r.device.model, "edge 50 neo");
  assert.equal(r.device.buildModel, "motorola edge 50 neo");
});

test("removes the USB-Audio prefix from the DAC name when the report arrives", () => {
  assert.equal(normalizeReport({ ...base, dac: { name: "USB-Audio - Cayin RU7" } }).dac.name, "Cayin RU7");
});

test("apps with their Play Store package, and old reports with names only", () => {
  const r = normalizeReport({
    ...base,
    compatibleApps: [
      { name: "PureBit", package: "app.purebit" },
      { name: "Bad", package: "not a package; <script>" },
      "Symfonium",
      { package: "no.name" },
    ],
  });
  assert.deepEqual(r.compatibleApps, [{ name: "PureBit", package: "app.purebit" }, { name: "Bad" }, { name: "Symfonium" }]);
  assert.deepEqual(publishedEntry(r).apps, r.compatibleApps);
});

test("single-line fields lose line breaks; summary and technical details keep them", () => {
  const r = normalizeReport({
    ...base,
    device: { ...base.device, model: "Pixel\r\n8\nBcc: x" },
    dac: { name: "FiiO\nKA1" },
    summary: "line 1\nline 2",
    technical: "a\nb",
  });
  assert.equal(r.device.model, "Pixel 8 Bcc: x");
  assert.equal(r.dac.name, "FiiO KA1");
  assert.equal(r.summary, "line 1\nline 2");
  assert.equal(r.technical, "a\nb");
});
