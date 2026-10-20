/**
 * Brute force protection for the sign-in form. Two in memory counters,
 * a restart clears pending lockouts which is fine for 15 minute
 * windows.
 *
 * Account plus IP: 10 failed attempts in a row locks the pair for 15
 * minutes. The lock is checked before the password, so even the right
 * password stays out until it expires. A successful sign-in clears
 * the pair counter, and attempts while locked do not extend the lock.
 *
 * Whole IP: 50 failures inside 15 minutes locks the IP no matter
 * which accounts were tried (password spraying).
 *
 * The email key is the submitted string, account or not, so probing
 * unknown addresses counts the same. Client IP comes from
 * CF-Connecting-IP since all traffic arrives through the Cloudflare
 * Tunnel and the origin has no published ports. Falls back to
 * X-Forwarded-For, then the socket address.
 */

const MAX_FAILS = Number(process.env.LOGIN_LOCK_MAX ?? 10);
const IP_MAX_FAILS = Number(process.env.LOGIN_IP_LOCK_MAX ?? 50);
export const LOCK_MS = Number(process.env.LOGIN_LOCK_MS ?? 15 * 60 * 1000);

interface Entry {
  fails: number;
  lockedUntil: number;
  windowStart: number;
}

const pairs = new Map<string, Entry>();
const ips = new Map<string, Entry>();

function sweep(map: Map<string, Entry>, now: number) {
  for (const [k, e] of map) {
    if (e.lockedUntil < now && now - e.windowStart > LOCK_MS) map.delete(k);
  }
}

export function clientIp(request: Request, socketIp: string): string {
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    socketIp
  );
}

function lockedMinutes(e: Entry | undefined, now: number): number {
  if (!e || e.lockedUntil <= now) return 0;
  return Math.max(1, Math.ceil((e.lockedUntil - now) / 60000));
}

/** Minutes of lockout remaining for this email+IP (0 = not locked). */
export function lockRemainingMinutes(email: string, ip: string): number {
  const now = Date.now();
  sweep(pairs, now);
  sweep(ips, now);
  return Math.max(lockedMinutes(pairs.get(`${email}|${ip}`), now), lockedMinutes(ips.get(ip), now));
}

/** Record one failed attempt. Returns the lockout minutes now in
 *  force, 0 if not locked yet. */
export function recordFailure(email: string, ip: string): number {
  const now = Date.now();
  const key = `${email}|${ip}`;
  let e = pairs.get(key);
  if (!e || now - e.windowStart > LOCK_MS) e = { fails: 0, lockedUntil: 0, windowStart: now };
  e.fails++;
  if (e.fails >= MAX_FAILS) {
    e.lockedUntil = now + LOCK_MS;
    e.fails = 0;
    e.windowStart = now;
  }
  pairs.set(key, e);

  let ie = ips.get(ip);
  if (!ie || now - ie.windowStart > LOCK_MS) ie = { fails: 0, lockedUntil: 0, windowStart: now };
  ie.fails++;
  if (ie.fails >= IP_MAX_FAILS) {
    ie.lockedUntil = now + LOCK_MS;
    ie.fails = 0;
    ie.windowStart = now;
  }
  ips.set(ip, ie);

  return lockRemainingMinutes(email, ip);
}

/** A successful sign-in clears the pair counter (the IP window keeps its history). */
export function recordSuccess(email: string, ip: string): void {
  pairs.delete(`${email}|${ip}`);
}
