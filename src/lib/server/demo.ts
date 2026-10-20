import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, users, userSettings } from './db';
import { hashPassword } from './auth';

/**
 * Demo mode, only ever used by a separate demo deployment. With
 * DEMO_MODE=1 there is no login, every visitor is signed in as one
 * built in demo account with full read/write access and the
 * login/register pages bounce to the dashboard. The demo database is
 * seeded with example data and reset daily by the host, so anything
 * visitors do is disposable. A normal install never sets DEMO_MODE.
 */
export const DEMO_MODE = process.env.DEMO_MODE === '1';
export const DEMO_USERNAME = 'demo';

/** Shown when a demo visitor tries to run AI Auto Fill. */
export const AI_DEMO_MESSAGE = 'AI services are disabled on the demo account.';

type DemoUser = { id: number; username: string; displayName: string; isAdmin: boolean };

/** The shared demo account, created on first use. */
export async function getDemoUser(): Promise<DemoUser> {
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      isAdmin: users.isAdmin
    })
    .from(users)
    .where(eq(users.username, DEMO_USERNAME))
    .limit(1);
  if (rows.length) {
    const r = rows[0];
    return {
      id: r.id,
      username: r.username,
      displayName: r.displayName?.trim() ? r.displayName : 'Demo',
      isAdmin: r.isAdmin === 1
    };
  }
  const inserted = await db
    .insert(users)
    .values({
      username: DEMO_USERNAME,
      displayName: 'Demo',
      // Random, never disclosed: sign-in is bypassed in demo mode, so
      // no password is ever used.
      passwordHash: hashPassword(randomBytes(24).toString('hex')),
      plan: 'paid',
      vehicleLimit: 25,
      retentionDays: null,
      createdAt: new Date().toISOString()
    })
    .returning({ id: users.id });
  await db.insert(userSettings).values({ userId: inserted[0].id });
  return { id: inserted[0].id, username: DEMO_USERNAME, displayName: 'Demo', isAdmin: false };
}
