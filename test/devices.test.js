import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIndex, lookupName } from "../src/devices.js";
import { applyMarketingName, normalizeReport, publishedEntry } from "../src/report.js";
import { phoneName } from "../src/names.js";

// Real excerpt from Google Play's list of devices (supported_devices.csv).
const CSV = [
  "Retail Branding,Marketing Name,Device,Model",
  '"Xiaomi","Xiaomi 17","pudding","25113PN0EC"',
  '"Xiaomi","Xiaomi 17","pudding","25113PN0EI"',
  '"Motorola","motorola edge 50 neo","vienna","motorola edge 50 neo"',
  '"Motorola","motorola edge 60 neo","vienna","motorola edge 50 neo"',
  '"Google","Pixel 8","shiba","Pixel 8"',
  '"Acme","Phone ""Pro"", 2026","acme","AC-1"',
].join("\r\n");

const index = buildIndex(CSV);

test("encuentra el nombre comercial de un código interno", () => {
  assert.equal(lookupName(index, "25113PN0EI", "pudding"), "Xiaomi 17");
  assert.equal(lookupName(index, "25113pn0ei", "PUDDING"), "Xiaomi 17");
});

test("no cambia nada si hay varios nombres posibles, ninguno o ya es el mismo", () => {
  assert.equal(lookupName(index, "motorola edge 50 neo", "vienna"), null); // Motorola reuses the code
  assert.equal(lookupName(index, "XYZ-123", "nada"), null);
  assert.equal(lookupName(index, "Pixel 8", "shiba"), null);
  assert.equal(lookupName(index, "25113PN0EI", "otro"), null); // the device has to match too
});

test("lee campos con comas y comillas", () => {
  assert.equal(lookupName(index, "AC-1", "acme"), 'Phone "Pro", 2026');
});

test("el reporte publicado lleva el nombre comercial y el correo, el código", () => {
  const r = normalizeReport({
    schema: 1,
    device: { manufacturer: "Xiaomi", model: "25113PN0EI", device: "pudding", android: "16", sdk: 36 },
    noDac: {}, bitPerfect: "no",
  });
  applyMarketingName(r, lookupName(index, r.device.buildModel, r.device.device));
  assert.equal(r.device.modelCode, "25113PN0EI");
  assert.equal(phoneName(r.device.manufacturer, r.device.model), "Xiaomi 17");
  assert.equal(publishedEntry(r).model, "17");

  // Without a commercial name, everything stays as it was.
  const m = normalizeReport({
    schema: 1,
    device: { manufacturer: "motorola", model: "motorola edge 50 neo", device: "vienna" },
    noDac: {}, bitPerfect: "no",
  });
  applyMarketingName(m, lookupName(index, m.device.buildModel, m.device.device));
  assert.equal(m.device.modelCode, undefined);
  assert.equal(phoneName(m.device.manufacturer, m.device.model), "Motorola edge 50 neo");
});
