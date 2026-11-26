import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db, reminders } from '$lib/server/db';
import { bumpVehicle } from '$lib/server/versions';
import { getSettings, getVehicleAccess } from '$lib/server/vehicles';
import { addMonths, latestOdometer, todayIso } from '$lib/server/reminders';
import { deleteReminderJob, getReminderJob } from '$lib/server/remindersAi';
import { setFlash } from '$lib/server/flash';

// The AI suggestions, shown for review before anything exists.
// Only the ticked rows with numbers become reminders, lifetime and
// monitor answers are information only, they have no interval to
// remind about.
export const load: PageServerLoad = async ({ locals, url }) => {
  const user = locals.user!;
  const job = getReminderJob(url.searchParams.get('job') ?? '', user.id);
  if (!job) throw redirect(303, '/reminders/ai');
  const access = await getVehicleAccess(user.id, job.vehicleId);
  if (!access) throw redirect(303, '/reminders');
  const settings = await getSettings(user.id);
  return {
    jobId: url.searchParams.get('job') ?? '',
    vehicle: {
      id: access.vehicle.id,
      name: access.vehicle.name,
      costTracking: access.vehicle.costTracking === 1
    },
    distanceUnit: settings.distanceUnit === 'Miles' ? 'mi' : 'km',
    suggestions: job.suggestions
  };
};

export const actions: Actions = {
  default: async ({ request, locals, cookies, url }) => {
    const user = locals.user!;
    const jobId = url.searchParams.get('job') ?? '';
    const job = getReminderJob(jobId, user.id);
    if (!job) throw redirect(303, '/reminders/ai');
    const access = await getVehicleAccess(user.id, job.vehicleId);
    if (!access) throw redirect(303, '/reminders');
    const vehicle = access.vehicle;
    const settings = await getSettings(user.id);
    const data = await request.formData();
    const toKm = (v: number) => (settings.distanceUnit === 'Miles' ? v * 1.60934 : v);

    interface NewReminder {
      title: string;
      distanceIntervalKm: number | null;
      timeIntervalMonths: number | null;
    }
    const picked: NewReminder[] = [];
    for (const s of job.suggestions) {
      if (!s.suggested || s.special) continue;
      if (!data.get(`use_${s.key}`)) continue;
      const kmRaw = String(data.get(`km_${s.key}`) ?? '').trim();
      const moRaw = String(data.get(`mo_${s.key}`) ?? '').trim();
      let km: number | null = null;
      let months: number | null = null;
      if (kmRaw !== '' && vehicle.costTracking !== 1) {
        const n = Number(kmRaw);
        if (isNaN(n) || n < 0) return fail(400, { error: `The distance for ${s.name} needs to be a number, 0 or more.` });
        km = Math.round(toKm(n));
      }
      if (moRaw !== '') {
        const n = Number(moRaw);
        if (!Number.isInteger(n) || n < 1 || n > 600) {
          return fail(400, { error: `The months for ${s.name} need to be a whole number, 1 or more.` });
        }
        months = n;
      }
      if (km == null && months == null) {
        return fail(400, { error: `${s.name} is ticked but has no interval. Fill one in or untick it.` });
      }
      picked.push({ title: s.name, distanceIntervalKm: km, timeIntervalMonths: months });
    }
    if (picked.length === 0) {
      return fail(400, { error: 'Tick at least one suggestion to add, or head back and add reminders by hand.' });
    }

    const odo = await latestOdometer(vehicle.id);
    const today = todayIso();
    await db.transaction(async (tx) => {
      for (const p of picked) {
        await tx.insert(reminders).values({
          vehicleId: vehicle.id,
          userId: user.id,
          title: p.title,
          distanceIntervalKm: p.distanceIntervalKm,
          timeIntervalMonths: p.timeIntervalMonths,
          nextDueOdometer:
            p.distanceIntervalKm != null && odo != null ? Math.round(odo + p.distanceIntervalKm) : null,
          nextDueDate: p.timeIntervalMonths != null ? addMonths(today, p.timeIntervalMonths) : null,
          notes: '',
          createdAt: new Date().toISOString()
        });
      }
      await bumpVehicle(tx, vehicle.id);
    });
    deleteReminderJob(jobId);
    setFlash(cookies, 'reminders');
    throw redirect(303, '/reminders');
  }
};
