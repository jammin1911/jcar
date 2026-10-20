import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { and, eq } from 'drizzle-orm';
import { db, locations, records } from '$lib/server/db';

async function ownLocation(userId: number, id: number) {
  const rows = await db.select().from(locations).where(eq(locations.id, id)).limit(1);
  const loc = rows[0];
  if (!loc || loc.userId !== userId) throw error(404, 'Location not found');
  return loc;
}

export const load: PageServerLoad = async ({ locals, params }) => {
  const loc = await ownLocation(locals.user!.id, Number(params.id));
  return { location: loc };
};

export const actions: Actions = {
  save: async ({ request, locals, params }) => {
    const user = locals.user!;
    const loc = await ownLocation(user.id, Number(params.id));
    const data = await request.formData();
    const s = (k: string) => String(data.get(k) ?? '').trim();
    await db
      .update(locations)
      .set({
        street: s('street'),
        city: s('city'),
        province: s('province'),
        postalCode: s('postal'),
        country: s('country'),
        notes: s('notes')
      })
      .where(eq(locations.id, loc.id));
    throw redirect(303, '/locations');
  },

  delete: async ({ locals, params }) => {
    const user = locals.user!;
    const loc = await ownLocation(user.id, Number(params.id));
    await db
      .update(records)
      .set({ locationId: null })
      .where(and(eq(records.locationId, loc.id)));
    await db.delete(locations).where(eq(locations.id, loc.id));
    throw redirect(303, '/locations');
  }
};
