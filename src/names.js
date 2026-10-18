// Name and format helpers shared with the website. They're copies of the functions of the same name
// in BitPerfectDetector-Web/public/phones.js, so each folder works on its own; test/names.test.js
// checks that both copies give the same results.

/** Bit-perfect support states, from worst to best. */
export const BIT_PERFECT_RANK = ["unknown", "no", "dac_rejected", "probable", "manufacturer", "confirmed"];

/**
 * Brand with a capital first letter and model without the repeated brand: some manufacturers include
 * it in Build.MODEL ("motorola" + "motorola edge 50 neo" → "Motorola" + "edge 50 neo").
 */
export function cleanPhoneName(manufacturer, model) {
  const brand = manufacturer ? manufacturer[0].toUpperCase() + manufacturer.slice(1) : manufacturer;
  const prefix = `${manufacturer.toLowerCase()} `;
  const stripped = model.toLowerCase().startsWith(prefix) ? model.slice(prefix.length).trim() : model;
  return { manufacturer: brand, model: stripped || model };
}

/**
 * DAC name without the "USB-Audio - " prefix some (Qualcomm) phones add to the product name:
 * "USB-Audio - Cayin RU7" → "Cayin RU7".
 */
export function cleanDacName(name) {
  return String(name ?? "").replace(/^USB[- ]?Audio\s*-\s*/i, "").trim() || String(name ?? "");
}

/** "Brand model" for display. */
export function phoneName(manufacturer, model) {
  const name = cleanPhoneName(manufacturer, model);
  return `${name.manufacturer} ${name.model}`;
}

export function formatResolution(rate, bits) {
  if (!rate) return "—";
  const khz = rate / 1000;
  const k = Number.isInteger(khz) ? String(khz) : khz.toFixed(1);
  return bits ? `${k} kHz / ${bits} bits` : `${k} kHz`;
}
