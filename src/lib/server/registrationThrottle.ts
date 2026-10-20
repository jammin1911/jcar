/**
 * Registration spam protection. Every registration makes an account, a
 * session, and an ntfy ping to the owner, so an open form is a spam
 * cannon. Two in memory caps on attempts, valid or not, so probing
 * the validation counts too.
 *
 * Per IP: 10 attempts per hour, a human needs one or two tries.
 * Global: 100 attempts per hour across all IPs, a circuit breaker for
 * distributed floods.
 *
 * Blocked requests are refused before any account work happens and do
 * not extend their own window. A restart clears the counters, which
 * is fine for hour long windows. Tunables are REG_PER_IP_MAX,
 * REG_GLOBAL_MAX, REG_WINDOW_MS.
 */

const PER_IP_MAX = Number(process.env.REG_PER_IP_MAX ?? 10);
const GLOBAL_MAX = Number(process.env.REG_GLOBAL_MAX ?? 100);
const WINDOW_MS = Number(process.env.REG_WINDOW_MS ?? 60 * 60 * 1000);

interface Entry {
  count: number;
  windowStart: number;
}

const perIp = new Map<string, Entry>();
let globalEntry: Entry = { count: 0, windowStart: Date.now() };

function live(e: Entry, now: number): Entry {
  return now - e.windowStart > WINDOW_MS ? { count: 0, windowStart: now } : e;
}

/** Refusal message if this IP may not attempt a registration right now, else null. */
export function registrationBlocked(ip: string): string | null {
  const now = Date.now();
  globalEntry = live(globalEntry, now);
  if (globalEntry.count >= GLOBAL_MAX) {
    return 'Registration is temporarily paused due to unusual activity. Please try again in a little while.';
  }
  const e = perIp.get(ip);
  if (e && now - e.windowStart <= WINDOW_MS && e.count >= PER_IP_MAX) {
    return 'Too many registration attempts from this network. Please try again in an hour.';
  }
  return null;
}

/** Count one registration attempt (call after the blocked check passes). */
export function recordRegistrationAttempt(ip: string): void {
  const now = Date.now();
  globalEntry = live(globalEntry, now);
  globalEntry.count++;
  let e = perIp.get(ip);
  if (!e || now - e.windowStart > WINDOW_MS) e = { count: 0, windowStart: now };
  e.count++;
  perIp.set(ip, e);
  // opportunistic cleanup so the map cannot grow without bound
  if (perIp.size > 10000) {
    for (const [k, v] of perIp) {
      if (now - v.windowStart > WINDOW_MS) perIp.delete(k);
    }
  }
}
