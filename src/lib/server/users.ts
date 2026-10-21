import { eq, inArray } from 'drizzle-orm';
import { purgePhotosForRecords, purgePhotosForVehicle, deleteFeedbackPhoto } from './photos';
import {
  db,
  users,
  vehicles,
  vehicleShares,
  records,
  vehicleParts,
  locations,
  userSettings,
  sessions,
  feedbackMessages
} from './db';
import { bumpVehicle, type Exec } from './versions';

/** How the app refers to a person: their display name (email as fallback). */
export async function getDisplayName(userId: number): Promise<string> {
  const rows = await db
    .select({ username: users.username, displayName: users.displayName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const r = rows[0];
  if (!r) return '';
  return r.displayName?.trim() ? r.displayName : r.username;
}

/** Display names for several users in one query, same fallback as above. */
export async function getDisplayNames(ids: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const uniq = [...new Set(ids)];
  if (!uniq.length) return out;
  const rows = await db
    .select({ id: users.id, username: users.username, displayName: users.displayName })
    .from(users)
    .where(inArray(users.id, uniq));
  for (const r of rows) out.set(r.id, r.displayName?.trim() ? r.displayName : r.username);
  return out;
}

export async function getUserIdentity(userId: number): Promise<{ email: string; displayName: string }> {
  const rows = await db
    .select({ username: users.username, displayName: users.displayName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const r = rows[0];
  return {
    email: r?.username ?? '',
    displayName: r?.displayName?.trim() ? r.displayName : (r?.username ?? '')
  };
}

/** Users log in with their email address, stored in the username column. */
export async function findUserByEmail(email: string) {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.username, email.toLowerCase().trim()))
    .limit(1);
  return rows[0] ?? null;
}

/** The admin account exists once someone has completed first-login setup. */
export async function adminExists(): Promise<boolean> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.isAdmin, 1))
    .limit(1);
  return rows.length > 0;
}

/** Delete a user and everything they own (used by admin user management). */
export async function deleteUserCascade(userId: number, exec: Exec = db): Promise<void> {
  // Vehicles this user added records to through shares: their owners
  // lose those records below, so those vehicles bump at the end.
  const sharedInto = await exec
    .select({ vehicleId: records.vehicleId })
    .from(records)
    .where(eq(records.userId, userId));
  const owned = await exec
    .select({ id: vehicles.id })
    .from(vehicles)
    .where(eq(vehicles.ownerId, userId));
  for (const v of owned) {
    await purgePhotosForVehicle(v.id, exec);
    await exec.delete(records).where(eq(records.vehicleId, v.id));
    await exec.delete(vehicleParts).where(eq(vehicleParts.vehicleId, v.id));
    await exec.delete(vehicleShares).where(eq(vehicleShares.vehicleId, v.id));
  }
  // Photos on records this user added to other people's vehicles.
  const ownRecs = await exec.select({ id: records.id }).from(records).where(eq(records.userId, userId));
  await purgePhotosForRecords(ownRecs.map((r) => r.id), exec);
  await exec.delete(vehicleShares).where(eq(vehicleShares.userId, userId));
  await exec.delete(records).where(eq(records.userId, userId));
  await exec.delete(locations).where(eq(locations.userId, userId));
  const fbRows = await db
    .select({ photoPath: feedbackMessages.photoPath })
    .from(feedbackMessages)
    .where(eq(feedbackMessages.userId, userId));
  for (const r of fbRows) await deleteFeedbackPhoto(r.photoPath);
  await exec.delete(feedbackMessages).where(eq(feedbackMessages.userId, userId));
  await exec.delete(userSettings).where(eq(userSettings.userId, userId));
  await exec.delete(sessions).where(eq(sessions.userId, userId));
  await exec.delete(vehicles).where(eq(vehicles.ownerId, userId));
  await exec.delete(users).where(eq(users.id, userId));
  for (const vid of new Set(sharedInto.map((r) => r.vehicleId))) {
    if (!owned.some((v) => v.id === vid)) await bumpVehicle(exec, vid);
  }
}
