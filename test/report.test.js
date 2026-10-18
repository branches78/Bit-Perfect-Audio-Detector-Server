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

test("normaliza un reporte válido", () => {
  const r = normalizeReport(base, 1000);
  assert.equal(r.receivedAt, 1000);
  assert.equal(r.device.model, "Pixel 8");
  assert.equal(r.noDac.maxRate, 192000);
  assert.equal(r.dac, null);
  assert.ok(r.id);
});

test("rechaza un esquema desconocido o sin modelo", () => {
  assert.throws(() => normalizeReport({ ...base, schema: 2 }), ReportError);
  assert.throws(() => normalizeReport({ ...base, device: { manufacturer: "X" } }), ReportError);
  assert.throws(() => normalizeReport(null), ReportError);
});

test("descarta valores fuera de rango y estados desconocidos", () => {
  const r = normalizeReport({ ...base, noDac: { maxRate: -5, maxBits: 999 }, bitPerfect: "hack" });
  assert.equal(r.noDac.maxRate, 0);
  assert.equal(r.noDac.maxBits, 0);
  assert.equal(r.bitPerfect, "unknown");
});

test("la entrada para publicar es JSON válido y solo trae lo que se publica", () => {
  const r = normalizeReport({ ...base, dac: { name: "FiiO KA1", maxRate: 384000, maxBits: 32, bitPerfect: true } },
    Date.parse("2026-10-17T10:00:00Z"));
  const parsed = JSON.parse(publishedEntryText(r));
  assert.deepEqual(parsed, publishedEntry(r));
  assert.deepEqual(Object.keys(parsed), ["date", "manufacturer", "model", "android", "bitPerfect", "noDac", "dac", "apps"]);
  assert.equal(parsed.date, "2026-10-17");
  assert.deepEqual(parsed.dac, { name: "FiiO KA1", maxRate: 384000, maxBits: 32, bitPerfect: true });
});

test("quita la marca repetida del modelo al recibir el reporte", () => {
  const r = normalizeReport({ ...base, device: { manufacturer: "motorola", model: "motorola edge 50 neo" } });
  assert.equal(r.device.manufacturer, "Motorola");
  assert.equal(r.device.model, "edge 50 neo");
  assert.equal(r.device.buildModel, "motorola edge 50 neo");
});

test("quita el prefijo USB-Audio del nombre del DAC al recibir el reporte", () => {
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
