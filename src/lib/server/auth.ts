import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { eq, lt } from 'drizzle-orm';
import { db, sessions, users } from './db';

export const SESSION_COOKIE = 'jcar_session';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days (Remember Me)
const SESSION_SHORT_MS = 24 * 60 * 60 * 1000; // 24 hours (no Remember Me)

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function createSession(cookies: Cookies, userId: number, remember = true): Promise<void> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = Date.now() + (remember ? SESSION_MS : SESSION_SHORT_MS);
  await db.insert(sessions).values({ id: token, userId, expiresAt });
  await db.update(users).set({ lastLoginAt: Date.now() }).where(eq(users.id, userId));
  cookies.set(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    // the secure flag follows the ORIGIN scheme, an install served over
    // https gets secure cookies and a plain http install still works
    // (browsers refuse to send secure cookies over http at all)
    secure: (process.env.ORIGIN ?? '').startsWith('https:'),
    // Remember Me: persistent 30-day cookie. Otherwise a browser-session
    // cookie (no maxAge) so closing the browser ends it.
    ...(remember ? { maxAge: SESSION_MS / 1000 } : {})
  });
  // opportunistic cleanup of expired sessions
  await db.delete(sessions).where(lt(sessions.expiresAt, Date.now()));
}

export async function destroySession(cookies: Cookies): Promise<void> {
  const token = cookies.get(SESSION_COOKIE);
  if (token) {
    await db.delete(sessions).where(eq(sessions.id, token));
    cookies.delete(SESSION_COOKIE, { path: '/' });
  }
}

export interface SessionUser {
  id: number;
  /** the user's email address (login identifier) */
  username: string;
  /** how the app refers to the user */
  displayName: string;
  isAdmin: boolean;
}

export async function getSessionUser(cookies: Cookies): Promise<SessionUser | null> {
  const token = cookies.get(SESSION_COOKIE);
  if (!token) return null;
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      isAdmin: users.isAdmin,
      expiresAt: sessions.expiresAt
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, token))
    .limit(1);
  const row = rows[0];
  if (!row || row.expiresAt < Date.now()) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName?.trim() ? row.displayName : row.username,
    isAdmin: row.isAdmin === 1
  };
}
