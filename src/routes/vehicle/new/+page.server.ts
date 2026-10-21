import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { eq } from 'drizzle-orm';
import { db, vehicles } from '$lib/server/db';
import { getVehicleAccess, numOrNull, VEHICLE_COOKIE } from '$lib/server/vehicles';
import { bumpVehicle } from '$lib/server/versions';
import { ungroupOdometer } from '$lib/odometer';
import { vehicleLimitBlock } from '$lib/server/plans';

export const load: PageServerLoad = async ({ locals, url }) => {
  const editId = Number(url.searchParams.get('edit'));
  if (editId) {
    const access = await getVehicleAccess(locals.user!.id, editId);
    if (!access) throw error(404, 'Vehicle not found');
    if (!access.isOwner) throw error(403, 'Only the owner can edit this vehicle');
    return { vehicle: access.vehicle };
  }
  return { vehicle: null };
};

function readVehicle(data: FormData) {
  const s = (k: string) => String(data.get(k) ?? '').trim();
  return {
    name: s('name'),
    year: s('year'),
    make: s('make'),
    model: s('model'),
    submodel: s('submodel'),
    engine: s('engine'),
    transmission: s('transmission'),
    driveType: s('driveType'),
    bodyType: s('bodyType'),
    distanceUnit: s('distanceUnit') || 'Kilometers',
    volumeUnit: s('volumeUnit') || 'Liters',
    licensePlate: s('licensePlate'),
    vin: s('vin'),
    tankCapacity: numOrNull(data.get('tankCapacity')),
    notes: s('notes'),
    costTracking: data.get('costTracking') === 'on' ? 1 : 0,
    purchasedOdometer: numOrNull(ungroupOdometer(data.get('pOdometer'))),
    purchasedPrice: numOrNull(data.get('pPrice')),
    purchasedDate: s('pDate'),
    purchasedNotes: s('pNotes'),
    soldOdometer: numOrNull(ungroupOdometer(data.get('sOdometer'))),
    soldPrice: numOrNull(data.get('sPrice')),
    soldDate: s('sDate'),
    soldNotes: s('sNotes')
  };
}

export const actions: Actions = {
  default: async ({ request, locals, cookies, url }) => {
    const user = locals.user!;
    const data = await request.formData();
    const v = readVehicle(data);
    if (!v.name) return fail(400, { error: 'Display Name is required' });

    const editId = Number(url.searchParams.get('edit'));
    if (editId) {
      const access = await getVehicleAccess(user.id, editId);
      if (!access || !access.isOwner) return fail(403, { error: 'Only the owner can edit this vehicle' });
      await db.transaction(async (tx) => {
        await tx.update(vehicles).set(v).where(eq(vehicles.id, editId));
        await bumpVehicle(tx, editId);
      });
      throw redirect(303, '/vehicle');
    }

    // Enforce the plan's vehicle limit.
    const block = await vehicleLimitBlock(user.id);
    if (block) {
      return fail(400, {
        error: `Your plan allows up to ${block.limit} vehicles and you already have ${block.owned}. Remove a vehicle or upgrade your plan to add another.`,
        values: v
      });
    }

    const inserted = await db.transaction(async (tx) => {
      const rows = await tx
        .insert(vehicles)
        .values({ ...v, ownerId: user.id, createdAt: new Date().toISOString() })
        .returning({ id: vehicles.id });
      await bumpVehicle(tx, rows[0].id);
      return rows;
    });
    cookies.set(VEHICLE_COOKIE, String(inserted[0].id), { path: '/', maxAge: 60 * 60 * 24 * 365 });
    throw redirect(303, '/');
  }
};
