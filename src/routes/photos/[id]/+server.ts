import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { promises as fs } from 'node:fs';
import { eq } from 'drizzle-orm';
import { db, records } from '$lib/server/db';
import { getPhotoRow, photoPath } from '$lib/server/photos';
import { getVehicleAccess } from '$lib/server/vehicles';

/** Serve a stored record photo (processed JPEG) to users with access to the vehicle. */
export const GET: RequestHandler = async ({ locals, params }) => {
  const user = locals.user!;
  const row = await getPhotoRow(Number(params.id));
  if (!row || !row.filename) throw error(404, 'Photo not found');
  const recRows = await db.select().from(records).where(eq(records.id, row.recordId)).limit(1);
  const rec = recRows[0];
  if (!rec) throw error(404, 'Photo not found');
  const access = await getVehicleAccess(user.id, rec.vehicleId);
  if (!access) throw error(403, 'No access to that vehicle');
  let buf: Buffer;
  try {
    buf = await fs.readFile(photoPath(row.filename));
  } catch {
    throw error(404, 'Photo file missing');
  }
  return new Response(new Uint8Array(buf), {
    headers: {
      'content-type': 'image/jpeg',
      'content-length': String(buf.length),
      // Photos are immutable once stored (ids are never reused), so
      // browsers can cache them hard - keeps repeat views instant.
      'cache-control': 'private, max-age=31536000, immutable'
    }
  });
};
