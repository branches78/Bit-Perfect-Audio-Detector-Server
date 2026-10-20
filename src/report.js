// Validation of the reports the app sends, and the entry ready to publish in data/reports.json.

import { randomUUID } from "node:crypto";
import { BIT_PERFECT_RANK, cleanDacName, cleanPhoneName } from "./names.js";

const MAX_TEXT = 20_000;

export class ReportError extends Error {}

/**
 * Clean text: no control characters and at most [max] characters. Single-line fields (names,
 * versions…) also lose line breaks, so they can't break the email's subject or the published entry.
 */
function str(value, max = 120, { multiline = false } = {}) {
  if (typeof value !== "string") return "";
  const text = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  return (multiline ? text : text.replace(/[\r\n]+/g, " ")).trim().slice(0, max);
}

function int(value, min, max) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : 0;
}

/** An Android package name, e.g. "app.purebit". */
const PACKAGE = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/;

/** { name, package? } from either a plain name or an object; null if there's no name. */
function normalizeApp(app) {
  const name = str(typeof app === "string" ? app : app?.name, 80);
  if (!name) return null;
  const pkg = typeof app === "object" ? str(app?.package, 150) : "";
  return PACKAGE.test(pkg) ? { name, package: pkg } : { name };
}

/**
 * Android emulators: Android Studio's and the virtual devices of Google Play's pre-launch report,
 * whose robot taps "Send report" on every upload (Build.MODEL "sdk_gphone64_arm64", Build.DEVICE
 * "emu64a"), plus Genymotion. Their reports say nothing about real phones.
 */
const EMULATOR_MODEL = /^(sdk_gphone|sdk_phone|google_sdk|sdk$|Android SDK built for|Emulator\b)/i;
const EMULATOR_DEVICE = /^(emu64|emulator|generic(_|$)|vbox86|goldfish|ranchu)/i;

export function isEmulator({ manufacturer = "", model = "", device = "" }) {
  return EMULATOR_MODEL.test(model) || EMULATOR_DEVICE.test(device) || /^genymotion$/i.test(manufacturer);
}

const UAC_VERSIONS = ["UAC1", "UAC2", "UAC3"];

/** Turns the received JSON into a clean report, or throws ReportError if it isn't valid. */
export function normalizeReport(body, now = Date.now()) {
  if (!body || typeof body !== "object" || body.schema !== 1) {
    throw new ReportError("Unrecognized report format");
  }
  const d = body.device ?? {};
  const device = {
    manufacturer: str(d.manufacturer, 60),
    model: str(d.model, 80),
    device: str(d.device, 80),
    android: str(d.android, 20),
    sdk: int(d.sdk, 1, 100),
    // Firmware version (build number), from app 1.0.5 on; it can differ by region.
    firmware: str(d.firmware, 120),
  };
  if (!device.manufacturer || !device.model) throw new ReportError("The manufacturer or the model is missing");
  if (isEmulator(device)) throw new ReportError("Reports from emulators aren't accepted");
  device.buildModel = device.model; // Build.MODEL as is, to look up the commercial name
  Object.assign(device, cleanPhoneName(device.manufacturer, device.model));

  const n = body.noDac ?? {};
  const noDac = {
    maxRate: int(n.maxRate, 0, 1_536_000),
    maxBits: int(n.maxBits, 0, 64),
    dynamic: n.dynamic === true,
    bitPerfectDeclared: n.bitPerfectDeclared === true,
  };

  let dac = null;
  if (body.dac && typeof body.dac === "object") {
    dac = {
      name: cleanDacName(str(body.dac.name, 80)),
      maxRate: int(body.dac.maxRate, 0, 1_536_000),
      maxBits: int(body.dac.maxBits, 0, 64),
      bitPerfect: body.dac.bitPerfect === true,
      bitPerfectMaxRate: int(body.dac.bitPerfectMaxRate, 0, 1_536_000),
      bitPerfectMaxBits: int(body.dac.bitPerfectMaxBits, 0, 64),
      // USB Audio Class version, from app 1.0.5 on; null if unknown.
      uac: UAC_VERSIONS.includes(body.dac.uac) ? body.dac.uac : null,
    };
  }

  const bitPerfect = BIT_PERFECT_RANK.includes(body.bitPerfect) ? body.bitPerfect : "unknown";
  // Older app versions send names only; newer ones send { name, package }.
  const compatibleApps = Array.isArray(body.compatibleApps)
    ? body.compatibleApps.map(normalizeApp).filter(Boolean).slice(0, 30)
    : [];

  return {
    id: randomUUID(),
    receivedAt: now,
    appVersion: str(body.appVersion, 20),
    device,
    noDac,
    dac,
    bitPerfect,
    compatibleApps,
    summary: str(body.summary, MAX_TEXT, { multiline: true }),
    technical: str(body.technical, MAX_TEXT, { multiline: true }),
  };
}

/**
 * Replaces the model code with the commercial name (from Google Play's list) and keeps the code in
 * device.modelCode: "Xiaomi" + "25113PN0EI" → "Xiaomi" + "17" (code 25113PN0EI).
 */
export function applyMarketingName(report, name) {
  if (!name) return report;
  report.device.modelCode = report.device.buildModel;
  report.device.model = cleanPhoneName(report.device.manufacturer, name).model;
  return report;
}

/** What gets published from a report: the entry pasted into BitPerfectAudioDetector-Web/public/data/reports.json. */
export function publishedEntry(report) {
  return {
    date: new Date(report.receivedAt).toISOString().slice(0, 10),
    manufacturer: report.device.manufacturer,
    model: report.device.model,
    android: report.device.android,
    // Firmware and UAC only when the app sends them (older versions don't); the website shows N/A.
    ...(report.device.firmware ? { firmware: report.device.firmware } : {}),
    bitPerfect: report.bitPerfect,
    noDac: { maxRate: report.noDac.maxRate, maxBits: report.noDac.maxBits, dynamic: report.noDac.dynamic },
    dac: report.dac
      ? {
        name: report.dac.name,
        ...(report.dac.uac ? { uac: report.dac.uac } : {}),
        maxRate: report.dac.maxRate,
        maxBits: report.dac.maxBits,
        bitPerfect: report.dac.bitPerfect,
      }
      : null,
    apps: report.compatibleApps,
  };
}

/** The entry formatted like reports.json, to copy as is into the array. */
export function publishedEntryText(report) {
  // One field per line; objects and lists on a single line, as in reports.json.
  const inline = (v) => {
    if (Array.isArray(v)) return `[${v.map(inline).join(", ")}]`;
    if (v && typeof v === "object") {
      return `{ ${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(", ")} }`;
    }
    return JSON.stringify(v);
  };
  const lines = Object.entries(publishedEntry(report)).map(([k, v]) => `    ${JSON.stringify(k)}: ${inline(v)}`);
  return `  {\n${lines.join(",\n")}\n  }`;
}

/**
 * Content of the email attachment: entry to publish, summary, technical details and full JSON.
 * The summary and technical details arrive in English from the app.
 */
export function attachmentText(report) {
  const { summary, technical, ...data } = report;
  return [
    `Reporte de Bit-Perfect Audio Detector ${report.id}`,
    `Recibido: ${new Date(report.receivedAt).toISOString()}`,
    "",
    "=== Para publicar: pégalo dentro del array de BitPerfectAudioDetector-Web/public/data/reports.json ===",
    publishedEntryText(report),
    "",
    "=== Resumen ===",
    summary || "(vacío)",
    "",
    "=== Detalles técnicos ===",
    technical || "(vacío)",
    "",
    "=== Datos completos (JSON) ===",
    JSON.stringify(data, null, 2),
    "",
  ].join("\n");
}
