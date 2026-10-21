import { and, asc, eq, or } from 'drizzle-orm';
import type { Cookies } from '@sveltejs/kit';
import { db, vehicles, vehicleShares, userSettings } from './db';
import type { Exec } from './versions';
import { memo } from './requestCache';
import { DEFAULT_SETTINGS, type DisplaySettings } from '$lib/format';

export type VehicleRow = typeof vehicles.$inferSelect;

export interface VehicleAccess {
  vehicle: VehicleRow;
  isOwner: boolean;
  ownerName: string;
}

/** All vehicles the user owns or has been shared, oldest first. */
export async function getUserVehicles(userId: number): Promise<VehicleAccess[]> {
  return memo(`vehicles:${userId}`, () => loadUserVehicles(userId));
}

async function loadUserVehicles(userId: number): Promise<VehicleAccess[]> {
  const owned = await db
    .select()
    .from(vehicles)
    .where(eq(vehicles.ownerId, userId))
    .orderBy(asc(vehicles.id));

  // Only accepted shares count. A pending invite grants no access
  // and the vehicle must not show up anywhere for the recipient.
  const sharedRows = await db
    .select({ vehicle: vehicles })
    .from(vehicleShares)
    .innerJoin(vehicles, eq(vehicleShares.vehicleId, vehicles.id))
    .where(and(eq(vehicleShares.userId, userId), eq(vehicleShares.status, 'accepted')))
    .orderBy(asc(vehicles.id));

  const { getDisplayNames } = await import('./users');
  const names = await getDisplayNames(sharedRows.map((r) => r.vehicle.ownerId));
  const result: VehicleAccess[] = [];
  for (const v of owned) result.push({ vehicle: v, isOwner: true, ownerName: '' });
  for (const r of sharedRows) {
    result.push({
      vehicle: r.vehicle,
      isOwner: false,
      ownerName: names.get(r.vehicle.ownerId) ?? ''
    });
  }
  return result;
}

/** Vehicle access check - returns null when the user can't see the vehicle. */
export async function getVehicleAccess(userId: number, vehicleId: number): Promise<VehicleAccess | null> {
  return memo(`access:${userId}:${vehicleId}`, () => loadVehicleAccess(userId, vehicleId));
}

async function loadVehicleAccess(userId: number, vehicleId: number): Promise<VehicleAccess | null> {
  const rows = await db.select().from(vehicles).where(eq(vehicles.id, vehicleId)).limit(1);
  const v = rows[0];
  if (!v) return null;
  if (v.ownerId === userId) return { vehicle: v, isOwner: true, ownerName: '' };
  const share = await db
    .select()
    .from(vehicleShares)
    .where(
      and(
        eq(vehicleShares.vehicleId, vehicleId),
        eq(vehicleShares.userId, userId),
        eq(vehicleShares.status, 'accepted')
      )
    )
    .limit(1);
  if (!share[0]) return null;
  const { getDisplayName } = await import('./users');
  return { vehicle: v, isOwner: false, ownerName: await getDisplayName(v.ownerId) };
}

export const VEHICLE_COOKIE = 'jcar_vehicle';

/** The vehicle selected on the Dashboard (cookie), falling back to the first. */
export async function getSelectedVehicle(
  cookies: Cookies,
  userId: number
): Promise<VehicleAccess | null> {
  return memo(`selected:${userId}:${cookies.get(VEHICLE_COOKIE) ?? ''}`, () => loadSelectedVehicle(cookies, userId));
}

async function loadSelectedVehicle(
  cookies: Cookies,
  userId: number
): Promise<VehicleAccess | null> {
  // Disabled vehicles (Manage Vehicles) are never the selected vehicle:
  // selection falls back to the first enabled one.
  const list = (await getUserVehicles(userId)).filter((a) => a.vehicle.active !== 0);
  if (list.length === 0) return null;
  const cookieId = Number(cookies.get(VEHICLE_COOKIE));
  const found = list.find((a) => a.vehicle.id === cookieId);
  return found ?? list[0];
}

/**
 * Delete a vehicle and everything attached to it (records + their photo
 * files, parts, shares). Owner-only - the caller checks ownership first,
 * or use the guard inside the Manage Vehicles page actions.
 */
export async function deleteVehicleCascade(vehicleId: number, exec: Exec = db): Promise<void> {
  const { records, vehicleParts } = await import('./db');
  const { purgePhotosForVehicle } = await import('./photos');
  const { bumpUsers, vehicleAudience } = await import('./versions');
  // The audience is read before the shares go, their versions still
  // bump so any page they hold preloaded stops being trusted.
  const audience = await vehicleAudience(exec, vehicleId);
  await purgePhotosForVehicle(vehicleId, exec);
  await exec.delete(records).where(eq(records.vehicleId, vehicleId));
  await exec.delete(vehicleParts).where(eq(vehicleParts.vehicleId, vehicleId));
  await exec.delete(vehicleShares).where(eq(vehicleShares.vehicleId, vehicleId));
  await exec.delete(vehicles).where(eq(vehicles.id, vehicleId));
  await bumpUsers(exec, audience);
}

export async function getSettings(userId: number): Promise<DisplaySettings> {
  return memo(`settings:${userId}`, () => loadSettings(userId));
}

async function loadSettings(userId: number): Promise<DisplaySettings> {
  const rows = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  const r = rows[0];
  if (!r) return { ...DEFAULT_SETTINGS };
  return {
    dateFormat: r.dateFormat ?? 'mdy',
    distanceUnit: r.distanceUnit ?? 'Kilometers',
    volumeUnit: r.volumeUnit ?? 'Liters',
    efficiencyUnit: r.efficiencyUnit ?? 'L/100km',
    theme: r.theme === 'dark' ? 'dark' : 'light'
  };
}

/** Parse an optional form number: '' → null. */
export function numOrNull(v: FormDataEntryValue | null): number | null {
  if (v === null) return null;
  const s = String(v).trim();
  if (s === '') return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}

export { or };
