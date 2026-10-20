import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { asc, eq } from 'drizzle-orm';
import { db, vehicles, vehicleParts, locations } from '$lib/server/db';
import { getSettings } from '$lib/server/vehicles';
import { getVehicleRecords } from '$lib/server/stats';
import { exportBlocked } from '$lib/server/plans';

export const GET: RequestHandler = async ({ locals }) => {
  const user = locals.user!;
  if (await exportBlocked(user.id)) throw redirect(303, '/import-export?upgrade=1');
  const owned = await db
    .select()
    .from(vehicles)
    .where(eq(vehicles.ownerId, user.id))
    .orderBy(asc(vehicles.id));

  const outVehicles = [];
  for (const v of owned) {
    const { id, ownerId, createdAt, ...rest } = v;
    const parts = await db.select().from(vehicleParts).where(eq(vehicleParts.vehicleId, v.id)).orderBy(asc(vehicleParts.id));
    const recs = await getVehicleRecords(v.id);
    outVehicles.push({
      ...rest,
      parts: parts.map(({ id: _id, vehicleId: _vid, ...p }) => p),
      records: recs.map(({ id: _id, vehicleId: _vid, userId: _uid, locationId: _lid, createdAt: _c, ...r }) => r)
    });
  }

  const locs = await db.select().from(locations).where(eq(locations.userId, user.id)).orderBy(asc(locations.id));
  const backup = {
    app: 'jcar',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: await getSettings(user.id),
    locations: locs.map(({ id: _id, userId: _uid, ...l }) => l),
    vehicles: outVehicles
  };

  return new Response(JSON.stringify(backup, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': 'attachment; filename="jcar-backup.json"'
    }
  });
};
