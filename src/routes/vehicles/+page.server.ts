import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { eq } from 'drizzle-orm';
import { db, vehicles, records } from '$lib/server/db';
import { bumpVehicle } from '$lib/server/versions';
import { deleteVehicleCascade, getUserVehicles, VEHICLE_COOKIE } from '$lib/server/vehicles';

// Manage Vehicles: owners can disable a vehicle (hidden from the
// selector, data kept) or delete it outright (with confirmation).
export const load: PageServerLoad = async ({ locals }) => {
  const user = locals.user!;
  const mine = (await getUserVehicles(user.id)).filter((a) => a.isOwner);
  const out = [];
  for (const a of mine) {
    const recs = await db.select({ id: records.id }).from(records).where(eq(records.vehicleId, a.vehicle.id));
    out.push({
      id: a.vehicle.id,
      name: a.vehicle.name,
      sub: [a.vehicle.year, a.vehicle.make, a.vehicle.model].filter(Boolean).join(' '),
      active: a.vehicle.active !== 0,
      costTracking: a.vehicle.costTracking === 1,
      recordCount: recs.length
    });
  }
  return { vehicles: out };
};

async function ownedVehicle(userId: number, vehicleId: number) {
  const rows = await db.select().from(vehicles).where(eq(vehicles.id, vehicleId)).limit(1);
  const v = rows[0];
  if (!v || v.ownerId !== userId) return null;
  return v;
}

export const actions: Actions = {
  // Edit opens the vehicle on the Vehicle Details page. Active
  // vehicles also become the current selection, same as picking them
  // in the dashboard selector.
  edit: async ({ request, locals, cookies }) => {
    const user = locals.user!;
    const data = await request.formData();
    const id = Number(data.get('vehicleId'));
    const v = await ownedVehicle(user.id, id);
    if (!v) return fail(403, { error: 'Only the owner can manage this vehicle' });
    if (v.active !== 0) {
      cookies.set(VEHICLE_COOKIE, String(id), { path: '/', maxAge: 60 * 60 * 24 * 365 });
    }
    throw redirect(303, `/vehicle?v=${id}`);
  },
  toggle: async ({ request, locals }) => {
    const user = locals.user!;
    const data = await request.formData();
    const id = Number(data.get('vehicleId'));
    const v = await ownedVehicle(user.id, id);
    if (!v) return fail(403, { error: 'Only the owner can manage this vehicle' });
    await db.transaction(async (tx) => {
      await tx
        .update(vehicles)
        .set({ active: v.active === 0 ? 1 : 0 })
        .where(eq(vehicles.id, id));
      await bumpVehicle(tx, id);
    });
    return { toggled: id };
  },
  delete: async ({ request, locals, cookies }) => {
    const user = locals.user!;
    const data = await request.formData();
    const id = Number(data.get('vehicleId'));
    const v = await ownedVehicle(user.id, id);
    if (!v) return fail(403, { error: 'Only the owner can delete this vehicle' });
    await db.transaction(async (tx) => {
      await deleteVehicleCascade(id, tx);
    });
    if (Number(cookies.get(VEHICLE_COOKIE)) === id) {
      cookies.delete(VEHICLE_COOKIE, { path: '/' });
    }
    return { deleted: id };
  }
};
