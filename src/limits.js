// Limits on received reports: two per IP every 24 hours (the app enforces the same limit on its
// own) and a daily cap for everyone together, so spam can't use up Resend's daily email quota.
// Kept in memory: on Render's free plan it's cleared when the service goes to sleep.

export const LIMIT_MS = 24 * 3600_000;
export const REPORTS_PER_IP = 2;
export const DAILY_CAP = 50;

/**
 * Key that identifies the sender: the IPv4 address, or the /64 block of an IPv6 address (each
 * connection gets a whole block, so changing the last part of the address doesn't skip the limit).
 */
export function ipGroup(ip = "") {
  const addr = String(ip).replace(/^::ffff:/i, "").split("%")[0];
  if (!addr.includes(":")) return addr;
  const [head, tail] = addr.split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const groups = tail === undefined ? h : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t];
  return `${groups.slice(0, 4).map((g) => (parseInt(g, 16) || 0).toString(16)).join(":")}::/64`;
}

export function createLimiter({ limitMs = LIMIT_MS, perKey = REPORTS_PER_IP, dailyCap = DAILY_CAP } = {}) {
  const timesByKey = new Map(); // key → times of its reports in the last limitMs
  let day = "";
  let today = 0;
  const dayOf = (now) => new Date(now).toISOString().slice(0, 10);

  return {
    /**
     * "ok" (and reserves the slot), "ip" if that sender already sent [perKey] in the last 24 hours,
     * or "daily" if today's cap has been reached.
     */
    take(key, now = Date.now()) {
      for (const [k, times] of timesByKey) {
        const recent = times.filter((t) => now - t < limitMs);
        if (recent.length) timesByKey.set(k, recent);
        else timesByKey.delete(k);
      }
      if (dayOf(now) !== day) {
        day = dayOf(now);
        today = 0;
      }
      const times = timesByKey.get(key) ?? [];
      if (times.length >= perKey) return "ip";
      if (today >= dailyCap) return "daily";
      timesByKey.set(key, [...times, now]);
      today += 1;
      return "ok";
    },

    /** Gives the slot back when the report couldn't be delivered, so the sender can try again. */
    release(key, now = Date.now()) {
      const times = (timesByKey.get(key) ?? []).slice(0, -1);
      if (times.length) timesByKey.set(key, times);
      else timesByKey.delete(key);
      if (dayOf(now) === day && today > 0) today -= 1;
    },
  };
}
