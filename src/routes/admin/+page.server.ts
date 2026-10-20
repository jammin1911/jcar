import type { PageServerLoad } from './$types';
import { requireAdmin, getOverview } from '$lib/server/admin';

export const load: PageServerLoad = async ({ locals }) => {
  requireAdmin(locals);
  return { overview: await getOverview() };
};
