import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { and, eq } from 'drizzle-orm';
import { db, records, reminders } from '$lib/server/db';
import { bumpVehicle } from '$lib/server/versions';
import { getSelectedVehicle, getSettings } from '$lib/server/vehicles';
import {
  REMINDER_ITEMS,
  advancedDue,
  latestOdometer,
  todayIso,
  addMonths,
  type ReminderRow
} from '$lib/server/reminders';
import { setFlash } from '$lib/server/flash';
import { distValue, type DisplaySettings } from '$lib/format';
import { fmtOdometer, ungroupOdometer } from '$lib/odometer';

// Add and edit a service reminder. The vehicle is the dashboard
// selected one, shown read only on the form like the record forms.

interface FormValues {
  title: string;
  distanceInterval: string;
  distanceDue: string;
  timeInterval: string;
  timeDue: string;
  notes: string;
}

async function loadReminder(vehicleId: number, editId: number): Promise<ReminderRow | null> {
  const rows = await db
    .select()
    .from(reminders)
    .where(and(eq(reminders.id, editId), eq(reminders.vehicleId, vehicleId)))
    .limit(1);
  return rows[0] ?? null;
}

export const load: PageServerLoad = async ({ locals, cookies, url }) => {
  const user = locals.user!;
  const access = await getSelectedVehicle(cookies, user.id);
  if (!access) throw redirect(303, '/');
  const vehicle = access.vehicle;
  const settings = await getSettings(user.id);

  let editing: ReminderRow | null = null;
  const editId = Number(url.searchParams.get('edit'));
  if (editId) {
    editing = await loadReminder(vehicle.id, editId);
    if (!editing) throw error(404, 'That reminder does not exist on this vehicle.');
  }

  // Title suggestions: the standard items plus the service titles
  // already used on this vehicle.
  const titleRows = await db
    .select({ title: records.title })
    .from(records)
    .where(and(eq(records.vehicleId, vehicle.id), eq(records.type, 'service')));
  const suggestions = new Set<string>(REMINDER_ITEMS.map((i) => i.name));
  for (const r of titleRows) {
    const t = (r.title ?? '').trim();
    if (t) suggestions.add(t);
  }

  const disp = (km: number | null) =>
    km == null ? '' : String(Math.round(distValue(km, settings)));
  const values: FormValues = editing
    ? {
        title: editing.title,
        distanceInterval: disp(editing.distanceIntervalKm),
        distanceDue: editing.nextDueOdometer == null ? '' : fmtOdometer(Math.round(distValue(editing.nextDueOdometer, settings))),
        timeInterval: editing.timeIntervalMonths == null ? '' : String(editing.timeIntervalMonths),
        timeDue: editing.nextDueDate ?? '',
        notes: editing.notes ?? ''
      }
    : { title: '', distanceInterval: '', distanceDue: '', timeInterval: '', timeDue: '', notes: '' };

  return {
    vehicle: { id: vehicle.id, name: vehicle.name, costTracking: vehicle.costTracking === 1 },
    distanceUnit: settings.distanceUnit === 'Miles' ? 'mi' : 'km',
    editing: editing ? { id: editing.id } : null,
    suggestions: [...suggestions].sort(),
    values
  };
};

interface Parsed {
  title: string;
  distanceIntervalKm: number | null;
  nextDueOdometer: number | null;
  timeIntervalMonths: number | null;
  nextDueDate: string | null;
  notes: string;
}

function parseForm(data: FormData, settings: DisplaySettings, costTracking: boolean): { values: FormValues; parsed?: Parsed; error?: string } {
  const values: FormValues = {
    title: String(data.get('title') ?? '').trim(),
    distanceInterval: String(data.get('distanceInterval') ?? '').trim(),
    distanceDue: String(data.get('distanceDue') ?? '').trim(),
    timeInterval: String(data.get('timeInterval') ?? '').trim(),
    timeDue: String(data.get('timeDue') ?? '').trim(),
    notes: String(data.get('notes') ?? '').trim()
  };
  const bad = (error: string) => ({ values, error });

  if (!values.title) return bad('Give the reminder a service name.');
  if (values.title.length > 120) return bad('That service name is too long.');

  const toKm = (v: number) => (settings.distanceUnit === 'Miles' ? v * 1.60934 : v);
  const num = (s: string): number | null => {
    if (s === '') return null;
    const n = Number(ungroupOdometer(s));
    return isNaN(n) ? NaN : n;
  };

  let distanceIntervalKm: number | null = null;
  let nextDueOdometer: number | null = null;
  if (!costTracking) {
    const di = num(values.distanceInterval);
    const dd = num(values.distanceDue);
    if (di === null ? false : isNaN(di) || di < 0) return bad('The distance interval needs to be a number, 0 or more.');
    if (dd === null ? false : isNaN(dd) || dd < 0) return bad('The distance due needs to be a number, 0 or more.');
    distanceIntervalKm = di == null ? null : Math.round(toKm(di));
    nextDueOdometer = dd == null ? null : Math.round(toKm(dd));
  }

  let timeIntervalMonths: number | null = null;
  if (values.timeInterval !== '') {
    const n = Number(values.timeInterval);
    if (!Number.isInteger(n) || n < 1 || n > 600) return bad('The time interval needs to be a whole number of months, 1 or more.');
    timeIntervalMonths = n;
  }

  let nextDueDate: string | null = null;
  if (values.timeDue !== '') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.timeDue)) return bad('The time due needs to be a date.');
    nextDueDate = values.timeDue;
  }

  return {
    values,
    parsed: {
      title: values.title,
      distanceIntervalKm,
      nextDueOdometer,
      timeIntervalMonths,
      nextDueDate,
      notes: values.notes
    }
  };
}

export const actions: Actions = {
  save: async ({ request, locals, cookies, url }) => {
    const user = locals.user!;
    const access = await getSelectedVehicle(cookies, user.id);
    if (!access) throw redirect(303, '/');
    const vehicle = access.vehicle;
    const settings = await getSettings(user.id);
    const data = await request.formData();
    const { values, parsed, error: parseError } = parseForm(data, settings, vehicle.costTracking === 1);
    if (parseError || !parsed) return fail(400, { error: parseError ?? 'Check the form and try again.', values });

    // A trigger with an interval but no due value starts counting
    // from where the vehicle is now.
    const odo = await latestOdometer(vehicle.id);
    if (parsed.distanceIntervalKm != null && parsed.nextDueOdometer == null && odo != null) {
      parsed.nextDueOdometer = Math.round(odo + parsed.distanceIntervalKm);
    }
    if (parsed.timeIntervalMonths != null && parsed.nextDueDate == null) {
      parsed.nextDueDate = addMonths(todayIso(), parsed.timeIntervalMonths);
    }
    if (
      parsed.nextDueOdometer == null &&
      parsed.nextDueDate == null &&
      parsed.distanceIntervalKm == null &&
      parsed.timeIntervalMonths == null
    ) {
      return fail(400, { error: 'Set a due distance, a due date, or a repeating interval.', values });
    }

    // The id rides a hidden field, the named action takes over the
    // query string so the pages own ?edit= would not survive the post.
    const editId = Number(data.get('id')) || Number(url.searchParams.get('edit'));
    await db.transaction(async (tx) => {
      if (editId) {
        const existing = await loadReminder(vehicle.id, editId);
        if (!existing) throw error(404, 'That reminder does not exist on this vehicle.');
        await tx.update(reminders).set({ ...parsed }).where(eq(reminders.id, editId));
      } else {
        await tx.insert(reminders).values({
          vehicleId: vehicle.id,
          userId: user.id,
          ...parsed,
          createdAt: new Date().toISOString()
        });
      }
      await bumpVehicle(tx, vehicle.id);
    });
    setFlash(cookies, 'reminder');
    throw redirect(303, '/reminders');
  },

  // Mark done: repeating reminders roll forward, one-time reminders
  // are removed. Nothing here ever runs on its own, only this tap.
  done: async ({ request, locals, cookies, url }) => {
    const access = await getSelectedVehicle(cookies, locals.user!.id);
    if (!access) throw redirect(303, '/');
    const data = await request.formData();
    const editId = Number(data.get('id')) || Number(url.searchParams.get('edit'));
    const row = editId ? await loadReminder(access.vehicle.id, editId) : null;
    if (!row) throw error(404, 'That reminder does not exist on this vehicle.');
    const next = advancedDue(row, await latestOdometer(access.vehicle.id), todayIso());
    await db.transaction(async (tx) => {
      if (next) {
        await tx.update(reminders).set(next).where(eq(reminders.id, row.id));
      } else {
        await tx.delete(reminders).where(eq(reminders.id, row.id));
      }
      await bumpVehicle(tx, access.vehicle.id);
    });
    setFlash(cookies, 'reminder');
    throw redirect(303, '/reminders');
  },

  delete: async ({ request, locals, cookies, url }) => {
    const access = await getSelectedVehicle(cookies, locals.user!.id);
    if (!access) throw redirect(303, '/');
    const data = await request.formData();
    const editId = Number(data.get('id')) || Number(url.searchParams.get('edit'));
    const row = editId ? await loadReminder(access.vehicle.id, editId) : null;
    if (!row) throw error(404, 'That reminder does not exist on this vehicle.');
    await db.transaction(async (tx) => {
      await tx.delete(reminders).where(eq(reminders.id, row.id));
      await bumpVehicle(tx, access.vehicle.id);
    });
    throw redirect(303, '/reminders');
  }
};
