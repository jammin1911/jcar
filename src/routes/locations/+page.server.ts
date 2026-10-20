import { asc, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db, locations } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals, url }) => {
  const user = locals.user!;
  const rows = await db
    .select()
    .from(locations)
    .where(eq(locations.userId, user.id))
    .orderBy(asc(locations.id));
  const from = url.searchParams.get('from');
  return {
    from,
    backHref: from ?? '/settings',
    locations: rows.map((l) => ({
      id: l.id,
      label: [l.street, l.city].filter(Boolean).join(', ') || '(no address)',
      sub: [l.province, l.postalCode, l.country].filter(Boolean).join(' '),
      notes: l.notes ?? ''
    }))
  };
};
