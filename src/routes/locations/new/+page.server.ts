import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db, locations } from '$lib/server/db';
import { bumpUser } from '$lib/server/versions';

export const load: PageServerLoad = async ({ url }) => {
  const from = url.searchParams.get('from');
  return { backHref: `/locations${from ? `?from=${encodeURIComponent(from)}` : ''}` };
};

export const actions: Actions = {
  default: async ({ request, locals, url }) => {
    const data = await request.formData();
    const s = (k: string) => String(data.get(k) ?? '').trim();
    await db.transaction(async (tx) => {
      await tx.insert(locations).values({
        userId: locals.user!.id,
      street: s('street'),
      city: s('city'),
      province: s('province'),
      postalCode: s('postal'),
      country: s('country'),
        notes: s('notes')
      });
      await bumpUser(tx, locals.user!.id);
    });
    const from = url.searchParams.get('from');
    throw redirect(303, `/locations${from ? `?from=${encodeURIComponent(from)}` : ''}`);
  }
};
