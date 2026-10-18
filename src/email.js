// Email notification for each new report (Resend API). The email carries the entry ready to
// publish in data/reports.json and, as an attachment, all the technical data.

import { formatResolution, phoneName } from "./names.js";
import { attachmentText, publishedEntryText } from "./report.js";

const BIT_PERFECT_LABEL = {
  confirmed: "Sí, confirmado con un DAC",
  manufacturer: "Sí, según el fabricante",
  probable: "Probable",
  dac_rejected: "Declarado, pero no con este DAC",
  no: "No",
  unknown: "Desconocido",
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/**
 * Sends the notification. Without RESEND_API_KEY (local development) it only prints it to the
 * console. Returns true if it was sent (or printed). In production a missing variable is an error:
 * the app is told the report wasn't delivered instead of losing it silently.
 */
export async function sendReportEmail(report, env = process.env) {
  const phone = phoneName(report.device.manufacturer, report.device.model);
  const lines = [
    ["Teléfono", report.device.modelCode ? `${phone} (código ${report.device.modelCode})` : phone],
    ["Android", `${report.device.android} (API ${report.device.sdk})`],
    ["Bit-perfect", BIT_PERFECT_LABEL[report.bitPerfect]],
    ["Sin DAC (declarado)", formatResolution(report.noDac.maxRate, report.noDac.maxBits)
      + (report.noDac.dynamic ? " · salida USB dinámica" : "")],
    ["Con DAC (máximo)", report.dac
      ? `${formatResolution(report.dac.maxRate, report.dac.maxBits)} · ${report.dac.name || "DAC sin nombre"}`
      : "Sin DAC conectado"],
    ["Apps compatibles", report.compatibleApps.map((a) => a.name).join(", ") || "Ninguna detectada"],
  ];
  const entry = publishedEntryText(report);

  const text = [
    `Nuevo reporte de ${phone}`,
    "",
    ...lines.map(([k, v]) => `${k}: ${v}`),
    "",
    "Para publicarlo, pega esto dentro del array de BitPerfectDetector-Web/public/data/reports.json (separado con una",
    "coma del reporte anterior), haz commit y push:",
    "",
    entry,
    "",
    "Los detalles técnicos completos van en el archivo adjunto.",
  ].join("\n");

  const html = `
    <h2>Nuevo reporte de ${escapeHtml(phone)}</h2>
    <table cellpadding="4">
      ${lines.map(([k, v]) => `<tr><td><b>${escapeHtml(k)}</b></td><td>${escapeHtml(v)}</td></tr>`).join("")}
    </table>
    <p><b>Para publicarlo</b>, pega esto dentro del array de <code>BitPerfectDetector-Web/public/data/reports.json</code>
      (separado con una coma del reporte anterior), haz commit y push:</p>
    <pre style="background:#f3f5f9;border:1px solid #e1e4ee;border-radius:6px;padding:10px">${escapeHtml(entry)}</pre>
    <p>Los detalles técnicos completos van en el archivo adjunto.</p>`;

  const fileName = `reporte-${phone.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${report.id.slice(0, 8)}.txt`;

  if (!env.RESEND_API_KEY || !env.REPORT_TO_EMAIL) {
    if (env.NODE_ENV === "production") {
      console.error("[email] Faltan RESEND_API_KEY o REPORT_TO_EMAIL: el reporte no se puede enviar.");
      return false;
    }
    console.warn(`[email] Sin RESEND_API_KEY/REPORT_TO_EMAIL: no se envía correo.\n${text}`);
    return true;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    // Don't keep the app waiting if Resend doesn't answer (the app gives up after 90 s).
    signal: AbortSignal.timeout(20_000),
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.REPORT_FROM_EMAIL || "Bit-Perfect Detector <onboarding@resend.dev>",
      to: env.REPORT_TO_EMAIL.split(",").map((s) => s.trim()).filter(Boolean),
      subject: `Nuevo reporte: ${phone}`,
      text,
      html,
      attachments: [
        { filename: fileName, content: Buffer.from(attachmentText(report), "utf8").toString("base64") },
      ],
    }),
  });
  if (!res.ok) {
    console.error(`[email] Resend respondió ${res.status}: ${await res.text()}`);
    return false;
  }
  return true;
}
