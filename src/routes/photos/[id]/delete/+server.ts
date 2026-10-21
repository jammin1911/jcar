import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { db, records } from '$lib/server/db';
import { getPhotoRow, deletePhoto } from '$lib/server/photos';
import { getVehicleAccess } from '$lib/server/vehicles';
import { bumpVehicle } from '$lib/server/versions';

/** Delete one record photo (from the record edit forms), then return to `back`. */
export const POST: RequestHandler = async ({ locals, params, url }) => {
  const user = locals.user!;
  const id = Number(params.id);
  const row = await getPhotoRow(id);
  if (!row) throw error(404, 'Photo not found');
  const recRows = await db.select().from(records).where(eq(records.id, row.recordId)).limit(1);
  const rec = recRows[0];
  if (!rec) throw error(404, 'Photo not found');
  const access = await getVehicleAccess(user.id, rec.vehicleId);
  if (!access) throw error(403, 'No access to that vehicle');
  await db.transaction(async (tx) => {
    await deletePhoto(id, tx);
    await bumpVehicle(tx, rec.vehicleId);
  });
  const back = url.searchParams.get('back') ?? '';
  throw redirect(303, back.startsWith('/') && !back.startsWith('//') ? back : '/browse');
};
