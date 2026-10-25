import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { and, eq } from 'drizzle-orm';
import { db, locations, records } from '$lib/server/db';
import { getSelectedVehicle, getSettings, getUserVehicles, getVehicleAccess } from '$lib/server/vehicles';
import { bumpVehicle } from '$lib/server/versions';
import { fmtDate, fmtDateTime, fmtMoney } from '$lib/format';
import {
  BACKFILL_CAP,
  backfillDates,
  backfillISO,
  createBackfillRecords,
  echoBackfillValues,
  parseYMD,
  readBackfillForm,
  todayYMD,
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
  const defaults = {
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
    until: q.get('until') ?? ''
  };

  const purchasedDate = chosen.vehicle.purchasedDate ?? '';
  return {
    vehicles: accessible.map((a) => ({ id: a.vehicle.id, name: a.vehicle.name })),
    vehicleId: chosen.vehicle.id,
    vehicleName: chosen.vehicle.name,
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
  dates: YMD[];
}

/** Parse the form, check access, and work out the exact date list. */
async function resolveRun(userId: number, data: FormData): Promise<Run | { error: string }> {
  const parsed = readBackfillForm(data);
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

  const dates = backfillDates(parsed.spec, start, todayYMD());
  if (!dates.length) return { error: 'That schedule makes no records in the range picked.' };
  if (dates.length > BACKFILL_CAP) {
    return {
      error: `That would create more than the ${BACKFILL_CAP} record limit. Narrow the range or repeat less often.`
    };
  }
  return { vehicleId: parsed.vehicleId, vehicleName: access.vehicle.name, spec: parsed.spec, dates };
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
    return {
      values,
      preview: {
        count: run.dates.length,
        vehicleName: run.vehicleName,
        typeLabel: run.spec.type === 'service' ? 'Service' : 'Expense',
        title: run.spec.title,
        each: fmtMoney(run.spec.totalCost),
        total: fmtMoney(run.spec.totalCost * run.dates.length),
        first: fmtDateTime(backfillISO(run.dates[0]), settings),
        last: fmtDateTime(backfillISO(run.dates[run.dates.length - 1]), settings)
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
      await createBackfillRecords(user.id, run.vehicleId, run.spec, run.dates, tx);
      await bumpVehicle(tx, run.vehicleId);
    });
    cookies.set('jcar_vehicle', String(run.vehicleId), { path: '/', maxAge: 60 * 60 * 24 * 365 });
    throw redirect(303, '/browse');
  }
};
