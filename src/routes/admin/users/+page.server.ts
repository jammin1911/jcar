import type { PageServerLoad } from './$types';
import { requireAdmin, getUserStats, fmtBytes } from '$lib/server/admin';
import { getSettings } from '$lib/server/vehicles';
import { plansEnabled } from '$lib/server/plans';
import { fmtDate, fmtDateTime } from '$lib/format';

export const load: PageServerLoad = async ({ locals }) => {
  const admin = requireAdmin(locals);
  const settings = await getSettings(admin.id);
  const users = await getUserStats();
  return {
    plansEnabled: plansEnabled(),
    users: users.map((u) => ({
      ...u,
      registered: fmtDate(u.createdAt, settings),
      lastLogin: u.lastLoginAt ? fmtDateTime(new Date(u.lastLoginAt).toISOString(), settings) : 'Never',
      size: fmtBytes(u.contentBytes)
    }))
  };
};
