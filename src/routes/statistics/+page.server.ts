import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getSelectedVehicle, getSettings } from '$lib/server/vehicles';
import { getVehicleRecords, fuelCalcs, summarize } from '$lib/server/stats';
import { retentionCutoff } from '$lib/server/plans';
import { fmtMoney, fmtNum, effValue, effUnitLabel, distValue, distLabel, volValue, volLabel } from '$lib/format';

export const load: PageServerLoad = async ({ locals, cookies }) => {
  const user = locals.user!;
  const access = await getSelectedVehicle(cookies, user.id);
  if (!access) throw redirect(303, '/vehicle/new');
  const v = access.vehicle;
  const s = await getSettings(user.id);

  const all = await getVehicleRecords(v.id, await retentionCutoff(user.id), v.costTracking === 1);
  const sum = summarize(all);
  const fuels = fuelCalcs(all);
  const eu = effUnitLabel(s); // 'L/100' or 'MPG'
  const du = distLabel(s);
  const vu = volLabel(s);

  const per100s = fuels.map((f) => f.per100).filter((x): x is number => x != null);
  const prices = fuels.map((f) => f.pricePerUnit).filter((x): x is number => x != null);
  const lastFuel = fuels[fuels.length - 1];
  const gaps = fuels.map((f) => f.daysSincePrev).filter((x): x is number => x != null);
  const dists = fuels.map((f) => f.distSincePrev).filter((x): x is number => x != null);

  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const eff = (l100: number | null | undefined, digits = 3) =>
    l100 == null ? '' : effValue(l100, s).toFixed(digits);
  const perUnit = (p: number | null | undefined) =>
    p == null ? '' : '$' + (s.volumeUnit === 'Gallons' ? p * 3.78541 : p).toFixed(3);
  const days = Math.max(1, sum.spanDays);

  const purchase = v.purchasedPrice ?? 0;
  const selling = v.soldPrice ?? 0;
  const tco = sum.totalRunningCost + purchase - selling;

  let totalTime = '';
  if (sum.firstDate && sum.lastDate) {
    const months = Math.max(
      0,
      (sum.lastDate.getFullYear() - sum.firstDate.getFullYear()) * 12 +
        (sum.lastDate.getMonth() - sum.firstDate.getMonth())
    );
    const years = Math.floor(months / 12);
    const rem = months % 12;
    totalTime = `${years} years, ${rem} months`;
  }

  const groups: [string, string][][] = [
    [
      ['Total Running Costs:', fmtMoney(sum.totalRunningCost)],
      ['Running Cost/day:', sum.recordCount ? fmtMoney(sum.totalRunningCost / days) : ''],
      ['Running Cost/' + du + ':', sum.totalDistance > 0 ? fmtMoney(sum.totalRunningCost / sum.totalDistance, 3) : ''],
      ['Distance/day:', sum.recordCount ? `${fmtNum(Math.round(distValue(sum.totalDistance / days, s)))} ${du}` : '']
    ],
    [
      ['Purchase Costs:', fmtMoney(purchase)],
      ['Selling Price:', fmtMoney(selling)],
      ['Total Cost of Ownership:', fmtMoney(tco)],
      ['Cost of Ownership/day:', sum.recordCount ? fmtMoney(tco / days) : ''],
      ['Cost of Ownership/' + du + ':', sum.totalDistance > 0 ? fmtMoney(tco / sum.totalDistance, 3) : '']
    ],
    [
      ['Total Distance:', sum.recordCount ? `${fmtNum(distValue(sum.totalDistance, s))} ${du}` : ''],
      ['Total Time:', totalTime]
    ]
  ];

  // Min and max get taken in display space. MPG is the reciprocal of
  // L/100km, so the smallest L/100km is the biggest MPG, and taking
  // min/max before converting would swap the labels.
  const per100sDisp = per100s.map((v) => effValue(v, s));
  const minEff = per100sDisp.length ? Math.min(...per100sDisp).toFixed(3) : '';
  const maxEff = per100sDisp.length ? Math.max(...per100sDisp).toFixed(3) : '';

  const fuelUps: [string, string, string, string][] = [
    // Avg is the volume-weighted overall (total measured volume over
    // total measured distance across valid segments), not the mean of
    // the per-fill figures. Last is the most recent computable one.
    [`Avg ${eu}:`, eff(sum.overallPer100), `Last ${eu}:`, eff(per100s[per100s.length - 1])],
    [`Min ${eu}:`, minEff, `Max ${eu}:`, maxEff],
    [`Avg $/${vu}:`, perUnit(avg(prices)), `Last $/${vu}:`, perUnit(lastFuel?.pricePerUnit)],
    [`Min $/${vu}:`, perUnit(prices.length ? Math.min(...prices) : null), `Max $/${vu}:`, perUnit(prices.length ? Math.max(...prices) : null)],
    [
      ` $/${du}:`.trim(),
      sum.totalDistance > 0 ? fmtMoney(sum.fuelTotalCost / sum.totalDistance, 3) : '',
      '$/fuelup:',
      sum.fuelCount ? fmtMoney(sum.fuelTotalCost / sum.fuelCount) : ''
    ],
    [
      '$/day:',
      sum.fuelCount ? fmtMoney(sum.fuelTotalCost / days) : '',
      `${du}/$:`,
      sum.fuelTotalCost > 0 ? fmtNum(distValue(sum.totalDistance, s) / sum.fuelTotalCost, 4) : ''
    ],
    [
      `${vu}/fuelup:`,
      sum.fuelCount ? fmtNum(volValue(sum.fuelTotalVolume / sum.fuelCount, s), 2) : '',
      'Days/fuelup:',
      gaps.length ? fmtNum(avg(gaps) ?? 0, 1) : ''
    ],
    [
      `${du.charAt(0).toUpperCase() + du.slice(1)}/fuelup:`,
      dists.length ? fmtNum(distValue(avg(dists) ?? 0, s), 1) : '',
      `${vu}/day:`,
      sum.fuelCount ? fmtNum(volValue(sum.fuelTotalVolume / days, s), 2) : ''
    ],
    ['Total $:', fmtMoney(sum.fuelTotalCost), 'Total ' + vu + ':', fmtNum(volValue(sum.fuelTotalVolume, s), 2)]
  ];

  const seDays = days;
  const servicesExpenses: [string, string, string, string][] = [
    [
      '$/day:',
      sum.serviceExpenseCount ? fmtMoney(sum.serviceExpenseTotal / seDays) : '',
      ` $/${du}:`.trim(),
      sum.serviceExpenseCount && sum.totalDistance > 0 ? fmtMoney(sum.serviceExpenseTotal / sum.totalDistance, 3) : ''
    ],
    ['Total $:', fmtMoney(sum.serviceExpenseTotal), '', '']
  ];

  // Cost-tracking vehicles have no odometer, so distance-derived
  // figures are dropped entirely rather than shown as zeros.
  let outGroups = groups;
  let outFuelUps = fuelUps;
  let outSE = servicesExpenses;
  if (v.costTracking === 1) {
    const duCap = du.charAt(0).toUpperCase() + du.slice(1);
    const drop = new Set([
      `Running Cost/${du}:`, 'Distance/day:', `Cost of Ownership/${du}:`, 'Total Distance:',
      `Avg ${eu}:`, `Last ${eu}:`, `Min ${eu}:`, `Max ${eu}:`,
      `$/${du}:`, `${du}/$:`, `${duCap}/fuelup:`
    ]);
    outGroups = groups.map((g) => g.map(([k, val]) => [k, drop.has(k) ? '' : val] as [string, string]));
    const scrub4 = (rows: [string, string, string, string][]) =>
      rows.map(
        ([k1, v1, k2, v2]) =>
          [k1, drop.has(k1) ? '' : v1, k2, drop.has(k2) ? '' : v2] as [string, string, string, string]
      );
    outFuelUps = scrub4(fuelUps);
    outSE = scrub4(servicesExpenses);
  }

  return {
    vehicleName: v.name,
    overallCount: sum.recordCount,
    fuelCount: sum.fuelCount,
    seCount: sum.serviceExpenseCount,
    groups: outGroups,
    fuelUps: outFuelUps,
    servicesExpenses: outSE
  };
};
