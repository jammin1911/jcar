import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { and, eq } from 'drizzle-orm';
import { db, locations, records } from '$lib/server/db';
import { getSelectedVehicle, getSettings, getUserVehicles, getVehicleAccess } from '$lib/server/vehicles';
import { getVehicleRecords } from '$lib/server/stats';
import { bumpVehicle } from '$lib/server/versions';
import { distLabel, distValue, fmtDate, fmtDateTime, fmtMoney, fmtNum } from '$lib/format';
import {
  BACKFILL_CAP,
  backfillDates,
  backfillDistance,
  backfillISO,
  createBackfillRecords,
  echoBackfillValues,
  parseYMD,
  readBackfillForm,
  todayYMD,
  type BackfillPoint,
  type BackfillSlot,
  type BackfillSpec,
  type YMD
} from '$lib/server/backfill';

export const load: PageServerLoad = async ({ locals, cookies, url }) => {
  const user = locals.user!;
  const accessible = await getUserVehicles(user.id);
  if (!accessible.length) throw redirect(303, '/vehicle/new');
  const settings = await getSettings(user.id);

  const wanted = Number(url.searchParams.get('vehicle')) || 0;
  const selected = await getSelectedVehicle(cookies, user.id);
  const chosen =
    accessible.find((a) => a.vehicle.id === wanted) ??
    accessible.find((a) => a.vehicle.id === selected?.vehicle.id) ??
    accessible[0];

  const titleRows = await db
    .select({ title: records.title })
    .from(records)
    .where(eq(records.vehicleId, chosen.vehicle.id));
  const titles = [...new Set(titleRows.map((r) => (r.title ?? '').trim()).filter(Boolean))].sort();

  const locRows = await db.select().from(locations).where(eq(locations.userId, user.id));

  // Defaults ride in on the query string so cancelling the confirm
  // popup lands back on the form the way it was filled in.
  const q = url.searchParams;
  const t = todayYMD();
  const todayStr = `${t.y}-${String(t.m).padStart(2, '0')}-${String(t.d).padStart(2, '0')}`;
  const defaults = {
    mode: q.get('mode') ?? 'time',
    interval: q.get('interval') ?? '',
    startOdometer: q.get('startOdometer') ?? '',
    type: q.get('type') ?? 'expense',
    title: q.get('title') ?? '',
    totalCost: q.get('totalCost') ?? '',
    notes: q.get('notes') ?? '',
    locationId: q.get('locationId') ?? '',
    freq: q.get('freq') ?? 'monthly',
    every: q.get('every') ?? '1',
    dayOfWeek: q.get('dayOfWeek') ?? '1',
    dayOfMonth: q.get('dayOfMonth') ?? '1',
    month: q.get('month') ?? '1',
    range: q.get('range') ?? 'count',
    count: q.get('count') ?? '12',
    until: q.get('until') ?? '',
    end: q.get('end') ?? todayStr
  };

  const purchasedDate = chosen.vehicle.purchasedDate ?? '';
  const purchasedOdometer = chosen.vehicle.purchasedOdometer ?? null;
  return {
    vehicles: accessible.map((a) => ({ id: a.vehicle.id, name: a.vehicle.name })),
    vehicleId: chosen.vehicle.id,
    vehicleName: chosen.vehicle.name,
    distUnit: distLabel(settings),
    costTracking: chosen.vehicle.costTracking === 1,
    purchasedOdometerDisplay:
      purchasedOdometer != null ? String(Math.round(distValue(purchasedOdometer, settings) * 100) / 100) : '',
    purchasedDate,
    purchasedLabel: purchasedDate ? fmtDate(`${purchasedDate}T12:00:00.000Z`, settings) : '',
    titles,
    locations: locRows.map((l) => ({
      id: l.id,
      label: [l.street, l.city].filter(Boolean).join(', ') || l.notes || 'Location'
    })),
    defaults
  };
};

interface Run {
  vehicleId: number;
  vehicleName: string;
  spec: BackfillSpec;
  slots: BackfillSlot[];
}

/** Parse the form, check access, and work out the exact record list. */
async function resolveRun(userId: number, data: FormData): Promise<Run | { error: string }> {
  const settings = await getSettings(userId);
  const parsed = readBackfillForm(data, settings.distanceUnit === 'Miles' ? 1.60934 : 1);
  if ('error' in parsed) return parsed;

  const access = await getVehicleAccess(userId, parsed.vehicleId);
  if (!access) return { error: 'Pick a vehicle you can add records to.' };

  if (parsed.spec.locationId != null) {
    const rows = await db
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.id, parsed.spec.locationId), eq(locations.userId, userId)));
    if (!rows.length) return { error: 'Pick one of your locations.' };
  }

  const end = parseYMD(parsed.spec.end);
  if (!end) return { error: 'Pick a valid end date.' };

  let slots: BackfillSlot[];
  if (parsed.spec.mode === 'distance') {
    if (access.vehicle.costTracking === 1) {
      return { error: 'Odometer backfill needs a vehicle with an odometer history, and this one is cost tracking only.' };
    }
    const start = parseYMD(parsed.spec.until);
    if (!start) return { error: 'Pick a valid start date.' };
    // The purchase point anchors the timeline when both halves are set,
    // then every record with an odometer adds a point.
    const points: BackfillPoint[] = [];
    const po = access.vehicle.purchasedOdometer ?? null;
    const pd = parseYMD(access.vehicle.purchasedDate ?? '');
    if (po != null && pd) points.push({ t: new Date(pd.y, pd.m - 1, pd.d, 12).getTime(), odo: po });
    const recs = await getVehicleRecords(parsed.vehicleId);
    for (const r of recs) {
      if (r.odometer != null) points.push({ t: new Date(r.datetime).getTime(), odo: r.odometer });
    }
    if (!points.length) {
      return { error: 'This vehicle has no records with odometers to date a backfill against.' };
    }
    slots = backfillDistance(parsed.spec, points, start, end);
  } else {
    let start: YMD | null = null;
    if (parsed.spec.range === 'date') {
      start = parseYMD(parsed.spec.until);
    } else if (parsed.spec.range === 'purchase') {
      start = parseYMD(access.vehicle.purchasedDate ?? '');
      if (!start) {
        return {
          error: `${access.vehicle.name} has no purchase date set. Add one in Vehicle Details, or pick a different way back.`
        };
      }
    }
    slots = backfillDates(parsed.spec, start, end).map((d) => ({ iso: backfillISO(d), odometer: null }));
  }

  if (!slots.length) return { error: 'That schedule makes no records in the range picked.' };
  if (slots.length > BACKFILL_CAP) {
    return {
      error: `That would create more than the ${BACKFILL_CAP} record limit. Narrow the range or repeat less often.`
    };
  }
  return { vehicleId: parsed.vehicleId, vehicleName: access.vehicle.name, spec: parsed.spec, slots };
}

export const actions: Actions = {
  // Submit shows the confirm popup with the exact summary, the
  // create action re-runs the same math and writes the records.
  preview: async ({ request, locals }) => {
    const user = locals.user!;
    const data = await request.formData();
    const values = echoBackfillValues(data);
    const run = await resolveRun(user.id, data);
    if ('error' in run) return fail(400, { error: run.error, values });
    const settings = await getSettings(user.id);
    // Distance mode lists the readings it will create, first and
    // last few when there are a lot of them.
    const shown =
      run.slots.length <= 6 ? run.slots : [...run.slots.slice(0, 3), ...run.slots.slice(-3)];
    return {
      values,
      preview: {
        count: run.slots.length,
        vehicleName: run.vehicleName,
        typeLabel: run.spec.type === 'service' ? 'Service' : 'Expense',
        title: run.spec.title,
        each: fmtMoney(run.spec.totalCost),
        total: fmtMoney(run.spec.totalCost * run.slots.length),
        first: fmtDateTime(run.slots[0].iso, settings),
        last: fmtDateTime(run.slots[run.slots.length - 1].iso, settings),
        lines:
          run.spec.mode === 'distance'
            ? shown.map((s) => `${fmtDate(s.iso, settings)} - ${fmtNum(s.odometer ?? 0)}${distLabel(settings)}`)
            : [],
        moreCount: run.spec.mode === 'distance' ? run.slots.length - shown.length : 0
      }
    };
  },

  create: async ({ request, locals, cookies }) => {
    const user = locals.user!;
    const data = await request.formData();
    const values = echoBackfillValues(data);
    const run = await resolveRun(user.id, data);
    if ('error' in run) return fail(400, { error: run.error, values });

    // The records and the version bump land together, same rule as
    // the single record forms.
    await db.transaction(async (tx) => {
      await createBackfillRecords(user.id, run.vehicleId, run.spec, run.slots, tx);
      await bumpVehicle(tx, run.vehicleId);
    });
    cookies.set('jcar_vehicle', String(run.vehicleId), { path: '/', maxAge: 60 * 60 * 24 * 365 });
    throw redirect(303, '/browse');
  }
};
