import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getSelectedVehicle, getSettings, getUserVehicles, VEHICLE_COOKIE } from '$lib/server/vehicles';
import { getReminderViews, todayIso } from '$lib/server/reminders';
import { aiConfigured } from '$lib/server/aiFill';
import { DEMO_MODE } from '$lib/server/demo';
import { takeFlash } from '$lib/server/flash';

// Service reminders for the selected vehicle. Due state is computed
// in the load, fresh on every visit, nothing is cached.
export const load: PageServerLoad = async ({ locals, cookies }) => {
  const user = locals.user!;
  const flash = takeFlash(cookies);
  const access = await getSelectedVehicle(cookies, user.id);
  if (!access) throw redirect(303, '/');
  const list = (await getUserVehicles(user.id)).filter((a) => a.vehicle.active !== 0);
  const views = await getReminderViews(access.vehicle.id);
  return {
    flash,
    today: todayIso(),
    settings: await getSettings(user.id),
    vehicle: {
      id: access.vehicle.id,
      name: access.vehicle.name,
      costTracking: access.vehicle.costTracking === 1
    },
    vehicles: list.map((a) => ({ id: a.vehicle.id, name: a.vehicle.name })),
    // The Auto Fill button shows whenever an AI endpoint is set up,
    // and on the demo so people can see the feature exists - the AI
    // page itself carries the plan and demo gates.
    aiAvailable: aiConfigured() || DEMO_MODE,
    reminders: views.map((v) => ({
      id: v.row.id,
      title: v.row.title,
      notes: v.row.notes ?? '',
      distanceIntervalKm: v.row.distanceIntervalKm,
      timeIntervalMonths: v.row.timeIntervalMonths,
      nextDueOdometer: v.row.nextDueOdometer,
      nextDueDate: v.row.nextDueDate,
      state: v.state,
      kmLeft: v.kmLeft,
      daysLeft: v.daysLeft
    }))
  };
};

export const actions: Actions = {
  // Same vehicle switching as the dashboard arrows, but it lands
  // back here instead of on the dashboard.
  select: async ({ request, cookies, locals }) => {
    const data = await request.formData();
    const id = Number(data.get('vehicleId'));
    const list = await getUserVehicles(locals.user!.id);
    if (list.some((a) => a.vehicle.id === id && a.vehicle.active !== 0)) {
      cookies.set(VEHICLE_COOKIE, String(id), { path: '/', maxAge: 60 * 60 * 24 * 365 });
    }
    throw redirect(303, '/reminders');
  }
};
