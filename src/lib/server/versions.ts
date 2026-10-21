import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, users, vehicles, vehicleShares } from './db';

// Data versions power the freshness probe (src/lib/preloadGuard.ts).
// Every write that can change what a user sees bumps a counter in the
// same transaction as the write itself, so a version can never lag
// behind the data it describes. The client stamps each preloaded page
// with the versions it was loaded under and asks the server for the
// current vector before trusting the preload. Any difference, even in
// a vehicle the page does not show, means fetch fresh. Conservative
// on purpose, a missed bump would serve stale and that is the one
// failure this whole setup exists to prevent.

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Exec = typeof db | Tx;

export interface VersionVector {
  user: number;
  vehicles: Record<string, number>;
}

/** The versions a users pages are rendered under right now. */
export async function getVersionVector(userId: number, exec: Exec = db): Promise<VersionVector> {
  const u = await exec.select({ v: users.dataVersion }).from(users).where(eq(users.id, userId)).limit(1);
  const owned = await exec
    .select({ id: vehicles.id, v: vehicles.dataVersion })
    .from(vehicles)
    .where(eq(vehicles.ownerId, userId));
  const shared = await exec
    .select({ id: vehicles.id, v: vehicles.dataVersion })
    .from(vehicleShares)
    .innerJoin(vehicles, eq(vehicleShares.vehicleId, vehicles.id))
    .where(and(eq(vehicleShares.userId, userId), eq(vehicleShares.status, 'accepted')));
  const map: Record<string, number> = {};
  for (const r of [...owned, ...shared]) map[String(r.id)] = r.v;
  return { user: u[0]?.v ?? 0, vehicles: map };
}

/** Bump the given users, if any. */
export async function bumpUsers(exec: Exec, ids: number[]): Promise<void> {
  const uniq = [...new Set(ids.filter((n) => Number.isFinite(n) && n > 0))];
  if (!uniq.length) return;
  await exec
    .update(users)
    .set({ dataVersion: sql`${users.dataVersion} + 1` })
    .where(inArray(users.id, uniq));
}

export async function bumpUser(exec: Exec, userId: number): Promise<void> {
  await bumpUsers(exec, [userId]);
}

/** Everyone who can see a vehicle: the owner plus accepted share holders. */
export async function vehicleAudience(exec: Exec, vehicleId: number): Promise<number[]> {
  const v = await exec.select({ ownerId: vehicles.ownerId }).from(vehicles).where(eq(vehicles.id, vehicleId)).limit(1);
  const shares = await exec
    .select({ userId: vehicleShares.userId })
    .from(vehicleShares)
    .where(and(eq(vehicleShares.vehicleId, vehicleId), eq(vehicleShares.status, 'accepted')));
  const ids = shares.map((s) => s.userId);
  if (v[0]) ids.push(v[0].ownerId);
  return [...new Set(ids)];
}

/** Bump a vehicle and everyone who can see it. */
export async function bumpVehicle(exec: Exec, vehicleId: number): Promise<void> {
  await exec
    .update(vehicles)
    .set({ dataVersion: sql`${vehicles.dataVersion} + 1` })
    .where(eq(vehicles.id, vehicleId));
  await bumpUsers(exec, await vehicleAudience(exec, vehicleId));
}
