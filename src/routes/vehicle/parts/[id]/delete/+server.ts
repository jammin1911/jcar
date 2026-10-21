import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { db, vehicleParts, vehicles } from '$lib/server/db';
import { bumpVehicle } from '$lib/server/versions';

// Delete a vehicle part (owner only), from the part's edit form.
export const POST: RequestHandler = async ({ locals, params }) => {
  const user = locals.user!;
  const id = Number(params.id);
  if (id) {
    const rows = await db
      .select({ ownerId: vehicles.ownerId, vehicleId: vehicleParts.vehicleId })
      .from(vehicleParts)
      .innerJoin(vehicles, eq(vehicles.id, vehicleParts.vehicleId))
      .where(eq(vehicleParts.id, id));
    if (rows[0]?.ownerId === user.id) {
      await db.transaction(async (tx) => {
        await tx.delete(vehicleParts).where(eq(vehicleParts.id, id));
        await bumpVehicle(tx, rows[0].vehicleId);
      });
    }
  }
  throw redirect(303, '/vehicle');
};
