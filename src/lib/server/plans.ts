import { eq, sql } from 'drizzle-orm';
import { db, users, vehicles } from './db';
import { memo } from './requestCache';

// Plans. Two of them, both $0 for now, no payment support. The plan
// picked at signup seeds the accounts fields (plan, vehicle limit,
// retention days) and Admin can edit them per user after that.
//
// Plans only exist when the install turns them on with
// PLANS_ENABLED=1. A normal self hosted install never sets it and
// runs unlimited, every gate below reads open, no vehicle limit, no
// retention hiding, exports and AI open to anyone signed in, and the
// signup and admin screens hide the plan bits entirely.

/** True only on installs that run with plans (the hosted one). */
export function plansEnabled(): boolean {
  return process.env.PLANS_ENABLED === '1';
}

/** How many free forever Paid plans are left to claim. 25 were on
 *  offer and the 3 paid accounts that already existed at the time are
 *  the baseline, they do not eat into the offer. Payments need to
 *  exist before this hits 0. */
export const FREE_FOREVER_PAID_OFFER = 25;
export const PAID_ACCOUNTS_AT_COUNTER_LAUNCH = 3;

/** Remaining free forever Paid plans. Display only, signup is not
 *  blocked at 0. */
export async function freeForeverPaidRemaining(): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)` })
    .from(users)
    .where(eq(users.plan, 'paid'));
  const claimed = Math.max(0, Number(rows[0]?.n ?? 0) - PAID_ACCOUNTS_AT_COUNTER_LAUNCH);
  return Math.max(0, FREE_FOREVER_PAID_OFFER - claimed);
}

export interface PlanDef {
  key: 'free' | 'paid';
  name: string;
  vehicleLimit: number;
  /** days of visible record history, null means forever */
  retentionDays: number | null;
  retentionLabel: string;
  cost: string;
  note: string;
}

export const PLANS: PlanDef[] = [
  {
    key: 'free',
    name: 'Free Plan',
    vehicleLimit: 2,
    retentionDays: 730,
    retentionLabel: '2 Years',
    cost: '$0/year',
    note: 'Free Forever'
  },
  {
    key: 'paid',
    name: 'Paid Plan',
    vehicleLimit: 25,
    retentionDays: null,
    retentionLabel: 'Forever',
    cost: '$0/year',
    note: 'Free Forever - Thanks for beta testing!'
  }
];

export function planDef(key: string): PlanDef {
  return PLANS.find((p) => p.key === key) ?? PLANS[0];
}

export interface UserPlan {
  plan: string;
  vehicleLimit: number;
  retentionDays: number | null;
}

export async function getUserPlan(userId: number): Promise<UserPlan> {
  return memo(`plan:${userId}`, () => loadUserPlan(userId));
}

async function loadUserPlan(userId: number): Promise<UserPlan> {
  const rows = await db
    .select({ plan: users.plan, vehicleLimit: users.vehicleLimit, retentionDays: users.retentionDays })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!rows.length) return { plan: 'free', vehicleLimit: 2, retentionDays: 730 };
  return rows[0];
}

/** Export is a Paid feature. Free users keep the buttons, using one
 *  prompts them to upgrade. */
export async function exportBlocked(userId: number): Promise<boolean> {
  if (!plansEnabled()) return false;
  return (await getUserPlan(userId)).plan === 'free';
}

/** AI Auto Fill is a Paid feature. Free users get an upgrade notice
 *  on the AI page and the AI endpoints refuse. */
export async function aiBlocked(userId: number): Promise<boolean> {
  if (!plansEnabled()) return false;
  return (await getUserPlan(userId)).plan === 'free';
}

/** Non-null when the user already owns `vehicleLimit` vehicles. */
export async function vehicleLimitBlock(
  userId: number,
  adding = 1
): Promise<{ limit: number; owned: number } | null> {
  if (!plansEnabled()) return null;
  const plan = await getUserPlan(userId);
  const rows = await db
    .select({ n: sql<number>`count(*)` })
    .from(vehicles)
    .where(eq(vehicles.ownerId, userId));
  const owned = rows[0]?.n ?? 0;
  return owned + adding > plan.vehicleLimit ? { limit: plan.vehicleLimit, owned } : null;
}

/**
 * Retention cutoff as a local naive ISO string. Records older than
 * this are hidden from the users views, never deleted. Null means
 * no cutoff, retention is forever.
 */
export async function retentionCutoff(userId: number): Promise<string | null> {
  if (!plansEnabled()) return null;
  const plan = await getUserPlan(userId);
  if (plan.retentionDays == null) return null;
  const d = new Date(Date.now() - plan.retentionDays * 86400000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
