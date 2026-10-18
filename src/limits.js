// Limits on received reports: one per IP every 48 hours (the app enforces the same limit on its
// own) and a daily cap for everyone together, so spam can't use up Resend's daily email quota.
// Kept in memory: on Render's free plan it's cleared when the service goes to sleep.

export const LIMIT_MS = 48 * 3600_000;
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

export function createLimiter({ limitMs = LIMIT_MS, dailyCap = DAILY_CAP } = {}) {
  const lastByKey = new Map();
  let day = "";
  let today = 0;
  const dayOf = (now) => new Date(now).toISOString().slice(0, 10);

  return {
    /**
     * "ok" (and reserves the slot), "ip" if that sender already sent one in the last 48 hours, or
     * "daily" if today's cap has been reached.
     */
    take(key, now = Date.now()) {
      for (const [k, t] of lastByKey) if (now - t >= limitMs) lastByKey.delete(k);
      if (dayOf(now) !== day) {
        day = dayOf(now);
        today = 0;
      }
      if (lastByKey.has(key)) return "ip";
      if (today >= dailyCap) return "daily";
      lastByKey.set(key, now);
      today += 1;
      return "ok";
    },

    /** Gives the slot back when the report couldn't be delivered, so the sender can try again. */
    release(key, now = Date.now()) {
      lastByKey.delete(key);
      if (dayOf(now) === day && today > 0) today -= 1;
    },
  };
}
