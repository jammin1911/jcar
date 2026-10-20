import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getSelectedVehicle, getSettings } from '$lib/server/vehicles';
import { getVehicleRecords, fuelCalcs, summarize } from '$lib/server/stats';
import { retentionCutoff } from '$lib/server/plans';
import { fmtDate, fmtMoney, fmtNum, distValue, distLabel } from '$lib/format';

export const load: PageServerLoad = async ({ locals, cookies }) => {
  const user = locals.user!;
  const access = await getSelectedVehicle(cookies, user.id);
  if (!access) throw redirect(303, '/vehicle/new');
  const v = access.vehicle;
  const s = await getSettings(user.id);
  const du = distLabel(s);

  const all = await getVehicleRecords(v.id, await retentionCutoff(user.id), v.costTracking === 1);
  const sum = summarize(all);
  const fuels = fuelCalcs(all);
  const gaps = fuels.map((f) => f.daysSincePrev).filter((x): x is number => x != null);
  const dists = fuels.map((f) => f.distSincePrev).filter((x): x is number => x != null);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const avgDays = avg(gaps);
  const avgDist = avg(dists);
  const lastFuel = fuels[fuels.length - 1];

  let nextDate = '';
  let nextOdo = '';
  if (lastFuel && avgDays != null) {
    const d = new Date(lastFuel.datetime);
    d.setDate(d.getDate() + Math.round(avgDays));
    nextDate = fmtDate(d.toISOString(), s);
  }
  if (lastFuel && avgDist != null && lastFuel.odometer != null) {
    nextOdo = `${fmtNum(Math.round(distValue(lastFuel.odometer + avgDist, s)))} ${du}`;
  }

  let range = '';
  let rangeNote = '';
  if (v.tankCapacity != null && sum.overallPer100) {
    const kmRange = (v.tankCapacity / sum.overallPer100) * 100;
    range = `${fmtNum(Math.round(distValue(kmRange, s)))} ${du}`;
  } else if (v.tankCapacity == null) {
    rangeNote = '(Tank Capacity not defined in vehicle details)';
  }

  const days = Math.max(1, sum.spanDays);
  const rows: { k: string; v: string; small?: string }[] = [
    { k: 'Next FuelUp Date:', v: nextDate || 'n/a' },
    { k: 'Next FuelUp Odometer:', v: nextOdo || 'n/a' },
    { k: 'Car Range:', v: range || 'n/a', small: rangeNote || undefined },
    { k: 'Trip Cost/day:', v: sum.recordCount ? fmtMoney(sum.totalRunningCost / days) : 'n/a' },
    { k: `Trip Cost/${du}:`, v: sum.totalDistance > 0 ? fmtMoney(sum.totalRunningCost / sum.totalDistance, 3) : 'n/a' },
    {
      k: `Trip Cost/100${du}:`,
      v: sum.totalDistance > 0 ? fmtMoney((sum.totalRunningCost / sum.totalDistance) * 100) : 'n/a'
    }
  ];

  return { rows, vehicleName: v.name };
};
