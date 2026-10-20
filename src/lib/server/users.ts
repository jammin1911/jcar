import { eq } from 'drizzle-orm';
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
export async function deleteUserCascade(userId: number): Promise<void> {
  const owned = await db
    .select({ id: vehicles.id })
    .from(vehicles)
    .where(eq(vehicles.ownerId, userId));
  for (const v of owned) {
    await purgePhotosForVehicle(v.id);
    await db.delete(records).where(eq(records.vehicleId, v.id));
    await db.delete(vehicleParts).where(eq(vehicleParts.vehicleId, v.id));
    await db.delete(vehicleShares).where(eq(vehicleShares.vehicleId, v.id));
  }
  // Photos on records this user added to other people's vehicles.
  const ownRecs = await db.select({ id: records.id }).from(records).where(eq(records.userId, userId));
  await purgePhotosForRecords(ownRecs.map((r) => r.id));
  await db.delete(vehicleShares).where(eq(vehicleShares.userId, userId));
  await db.delete(records).where(eq(records.userId, userId));
  await db.delete(locations).where(eq(locations.userId, userId));
  const fbRows = await db
    .select({ photoPath: feedbackMessages.photoPath })
    .from(feedbackMessages)
    .where(eq(feedbackMessages.userId, userId));
  for (const r of fbRows) await deleteFeedbackPhoto(r.photoPath);
  await db.delete(feedbackMessages).where(eq(feedbackMessages.userId, userId));
  await db.delete(userSettings).where(eq(userSettings.userId, userId));
  await db.delete(sessions).where(eq(sessions.userId, userId));
  await db.delete(vehicles).where(eq(vehicles.ownerId, userId));
  await db.delete(users).where(eq(users.id, userId));
}
