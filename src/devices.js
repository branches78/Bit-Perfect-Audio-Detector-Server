// A phone's commercial name from its model code, using Google Play's official list of devices.
// Some manufacturers (e.g. Xiaomi) put an internal code in Build.MODEL:
// "25113PN0EI" + device "pudding" → "Xiaomi 17".
//
// The list (~5 MB, UTF-16) is downloaded the first time it's needed and kept in memory for 24 h.
// If it can't be downloaded, the report goes through with the original code.

const LIST_URL = "https://storage.googleapis.com/play_public/supported_devices.csv";
const KEEP_MS = 24 * 3600_000;
const RETRY_AFTER_ERROR_MS = 10 * 60_000;

let index = null; // Map "model|device" (lowercase) → Set of commercial names
let loadedAt = 0;
let loading = null;
let failedAt = 0;

/** Splits a CSV line with quoted fields ("a","b, c","d""e"). */
function parseCsvLine(line) {
  const fields = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { fields.push(field); field = ""; }
    else field += ch;
  }
  fields.push(field);
  return fields;
}

/** Index "model|device" → commercial names, built from the list's text. */
export function buildIndex(csvText) {
  const map = new Map();
  const lines = csvText.split(/\r?\n/);
  for (const line of lines.slice(1)) { // the first line is the header
    if (!line) continue;
    const [, marketingName, device, model] = parseCsvLine(line);
    if (!marketingName || !model) continue;
    const key = `${model.trim().toLowerCase()}|${(device ?? "").trim().toLowerCase()}`;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(marketingName.trim());
  }
  return map;
}

/**
 * Commercial name if the list gives exactly one for that model and device and it differs from the
 * model; null if there are none or several possible ones (manufacturers that reuse codes).
 */
export function lookupName(map, model, device) {
  const names = map.get(`${String(model).trim().toLowerCase()}|${String(device ?? "").trim().toLowerCase()}`);
  if (!names || names.size !== 1) return null;
  const [name] = names;
  return name.toLowerCase() === String(model).trim().toLowerCase() ? null : name;
}

async function loadIndex() {
  const now = Date.now();
  if (index && now - loadedAt < KEEP_MS) return index;
  if (now - failedAt < RETRY_AFTER_ERROR_MS) return index; // the last download failed recently
  loading ??= (async () => {
    try {
      const res = await fetch(LIST_URL, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const utf16 = (bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff);
      const text = new TextDecoder(utf16 ? (bytes[0] === 0xff ? "utf-16le" : "utf-16be") : "utf-8").decode(bytes);
      index = buildIndex(text);
      loadedAt = Date.now();
      console.log(`[devices] Google Play device list loaded: ${index.size} models`);
    } catch (e) {
      failedAt = Date.now();
      console.error("[devices] Could not download the device list:", e.message);
    } finally {
      loading = null;
    }
    return index;
  })();
  return loading;
}

/** The phone's commercial name, or null if there isn't exactly one (or no list). */
export async function marketingName(model, device) {
  const map = await loadIndex();
  return map ? lookupName(map, model, device) : null;
}
