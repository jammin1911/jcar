import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { eq } from 'drizzle-orm';
import { db, vehicleParts, vehicles } from '$lib/server/db';
import { bumpVehicle } from '$lib/server/versions';
import { getSelectedVehicle, numOrNull } from '$lib/server/vehicles';

/** Load a part for editing, verifying the signed-in user owns its
 *  vehicle. Returns null when the part doesn't exist or isn't theirs. */
async function ownedPart(partId: number, userId: number) {
  const rows = await db
    .select({ part: vehicleParts, vehicleName: vehicles.name, ownerId: vehicles.ownerId })
    .from(vehicleParts)
    .innerJoin(vehicles, eq(vehicles.id, vehicleParts.vehicleId))
    .where(eq(vehicleParts.id, partId));
  const row = rows[0];
  if (!row || row.ownerId !== userId) return null;
  return row;
}

export const load: PageServerLoad = async ({ locals, cookies, url }) => {
  const user = locals.user!;
  const editId = Number(url.searchParams.get('edit'));
  if (editId) {
    const row = await ownedPart(editId, user.id);
    if (!row) throw redirect(303, '/vehicle');
    const p = row.part;
    return {
      vehicleName: row.vehicleName,
      vehicleId: p.vehicleId,
      part: {
        id: p.id,
        name: p.name ?? '',
        partNumber: p.partNumber ?? '',
        type: p.type ?? '',
        brand: p.brand ?? '',
        size: p.size ?? '',
        volume: p.volume ?? '',
        pressure: p.pressure ?? '',
        quantity: p.quantity ?? null,
        notes: p.notes ?? ''
      }
    };
  }
  const access = await getSelectedVehicle(cookies, user.id);
  if (!access) throw redirect(303, '/vehicle/new');
  return { vehicleName: access.vehicle.name, vehicleId: access.vehicle.id, part: null };
};

export const actions: Actions = {
  default: async ({ request, locals, cookies }) => {
    const user = locals.user!;
    const data = await request.formData();
    const s = (k: string) => String(data.get(k) ?? '').trim();
    const name = s('name');
    if (!name) return fail(400, { error: 'Name is required' });
    const fields = {
      name,
      partNumber: s('partno'),
      type: s('type'),
      brand: s('brand'),
      size: s('size'),
      volume: s('volume'),
      pressure: s('pressure'),
      quantity: numOrNull(data.get('quantity')),
      notes: s('notes')
    };

    const partId = Number(data.get('partId'));
    if (partId) {
      // Edit: the part must belong to a vehicle this user owns.
      const row = await ownedPart(partId, user.id);
      if (!row) throw redirect(303, '/vehicle');
      await db.transaction(async (tx) => {
        await tx.update(vehicleParts).set(fields).where(eq(vehicleParts.id, partId));
        await bumpVehicle(tx, row.part.vehicleId);
      });
      throw redirect(303, '/vehicle');
    }

    const access = await getSelectedVehicle(cookies, user.id);
    if (!access) throw redirect(303, '/vehicle/new');
    await db.transaction(async (tx) => {
      await tx.insert(vehicleParts).values({ vehicleId: access.vehicle.id, ...fields });
      await bumpVehicle(tx, access.vehicle.id);
    });
    throw redirect(303, '/vehicle');
  }
};
