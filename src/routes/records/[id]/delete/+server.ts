import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { db, records } from '$lib/server/db';
import { getVehicleAccess } from '$lib/server/vehicles';
import { purgePhotosForRecords } from '$lib/server/photos';
import { bumpVehicle } from '$lib/server/versions';

/** Delete a record (from the record edit forms). Access = vehicle owner or share. */
export const POST: RequestHandler = async ({ locals, params }) => {
  const user = locals.user!;
  const id = Number(params.id);
  const rows = await db.select().from(records).where(eq(records.id, id)).limit(1);
  const rec = rows[0];
  if (!rec) throw error(404, 'Record not found');
  const access = await getVehicleAccess(user.id, rec.vehicleId);
  if (!access) throw error(403, 'No access to that vehicle');
  await db.transaction(async (tx) => {
    await purgePhotosForRecords([id], tx);
    await tx.delete(records).where(eq(records.id, id));
    await bumpVehicle(tx, rec.vehicleId);
  });
  throw redirect(303, '/browse');
};
