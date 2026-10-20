import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { eq } from 'drizzle-orm';
import { requireAdmin, getUserStat, getUserVehicleNames, fmtBytes } from '$lib/server/admin';
import { getSettings } from '$lib/server/vehicles';
import { deleteUserCascade } from '$lib/server/users';
import { hashPassword } from '$lib/server/auth';
import { plansEnabled } from '$lib/server/plans';
import { db, users, sessions } from '$lib/server/db';
import { fmtDate, fmtDateTime } from '$lib/format';

export const load: PageServerLoad = async ({ locals, params }) => {
  const admin = requireAdmin(locals);
  const id = Number(params.id);
  const u = await getUserStat(id);
  if (!u) throw error(404, 'User not found');
  const settings = await getSettings(admin.id);
  const planRows = await db
    .select({ plan: users.plan, vehicleLimit: users.vehicleLimit, retentionDays: users.retentionDays })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return {
    plansEnabled: plansEnabled(),
    target: {
      ...u,
      registered: fmtDate(u.createdAt, settings),
      lastLogin: u.lastLoginAt ? fmtDateTime(new Date(u.lastLoginAt).toISOString(), settings) : 'Never',
      size: fmtBytes(u.contentBytes),
      vehicleNames: await getUserVehicleNames(id),
      plan: planRows[0]?.plan ?? 'free',
      vehicleLimit: planRows[0]?.vehicleLimit ?? 2,
      // NULL retention means Forever and shows as blank, never a
      // numeric fallback, or a wrong value would get saved.
      retentionDays: planRows[0]?.retentionDays ?? null
    }
  };
};

export const actions: Actions = {
  savePlan: async ({ locals, params, request }) => {
    requireAdmin(locals);
    if (!plansEnabled()) {
      return fail(400, { error: 'Plans are not enabled on this install.' });
    }
    const id = Number(params.id);
    const data = await request.formData();
    const plan = String(data.get('plan') ?? 'free');
    if (plan !== 'free' && plan !== 'paid') {
      return fail(400, { error: 'Unknown plan' });
    }
    const vehicleLimit = Math.floor(Number(data.get('vehicleLimit')));
    if (!Number.isFinite(vehicleLimit) || vehicleLimit < 1 || vehicleLimit > 1000) {
      return fail(400, { error: 'Vehicle limit must be a number between 1 and 1000' });
    }
    // Blank retention = forever (NULL). Otherwise a positive day count.
    const rawRetention = String(data.get('retentionDays') ?? '').trim();
    let retentionDays: number | null = null;
    if (rawRetention !== '') {
      retentionDays = Math.floor(Number(rawRetention));
      if (!Number.isFinite(retentionDays) || retentionDays < 1) {
        return fail(400, { error: 'Retention days must be a positive number, or blank for Forever' });
      }
    }
    await db.update(users).set({ plan, vehicleLimit, retentionDays }).where(eq(users.id, id));
    return { message: 'Plan updated.' };
  },

  resetPassword: async ({ locals, params, request }) => {
    requireAdmin(locals);
    const id = Number(params.id);
    const data = await request.formData();
    const password = String(data.get('password') ?? '');
    if (password.length < 6) {
      return fail(400, { error: 'Password must be at least 6 characters' });
    }
    await db.update(users).set({ passwordHash: hashPassword(password) }).where(eq(users.id, id));
    // Force the user to sign in again with the new password everywhere.
    await db.delete(sessions).where(eq(sessions.userId, id));
    return { message: 'Password reset. The user has been signed out everywhere.' };
  },

  revokeSessions: async ({ locals, params }) => {
    requireAdmin(locals);
    const id = Number(params.id);
    await db.delete(sessions).where(eq(sessions.userId, id));
    return { message: 'All sessions revoked. The user must sign in again.' };
  },

  deleteUser: async ({ locals, params }) => {
    requireAdmin(locals);
    const id = Number(params.id);
    const target = await getUserStat(id);
    if (!target) throw error(404, 'User not found');
    if (target.isAdmin) {
      return fail(400, { error: 'The admin account cannot be deleted.' });
    }
    await deleteUserCascade(id);
    throw redirect(303, '/admin/users');
  }
};
