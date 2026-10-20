import { getVehicleRecords, fuelCalcs, type FuelCalc } from './stats';
import type { DisplaySettings } from '$lib/format';

// Chart series shared by the Charts grid sparklines and the full
// screen chart page. Values come pre-converted into the users display
// units, and points carry their timestamp so the full view can filter
// by period and scale the x axis by time.

export interface ChartPoint {
  t: number; // epoch ms
  v: number;
}

export interface ChartDef {
  key: string;
  /** caption used on the Charts grid tile */
  cap: string;
  /** fuller title used on the full-screen page */
  title: string;
  kind: 'line' | 'compare' | 'bars';
  points: ChartPoint[];
  /** for kind=compare: averages of the first/second half (display units) */
  compareOf: ((fuels: FuelCalc[]) => { first: number; second: number } | null) | null;
  /** the fuel records behind this chart (for period filtering of compare) */
  fuels: FuelCalc[] | null;
}

const pt = (iso: string, v: number | null): ChartPoint | null =>
  v == null || isNaN(v) ? null : { t: new Date(iso).getTime(), v };

function series(items: (ChartPoint | null)[]): ChartPoint[] {
  return items.filter((p): p is ChartPoint => p != null).sort((a, b) => a.t - b.t);
}

export async function getCharts(vehicleId: number, s: DisplaySettings, cutoff?: string | null, ignoreOdometer = false): Promise<ChartDef[]> {
  const all = await getVehicleRecords(vehicleId, cutoff, ignoreOdometer);
  const fuels = fuelCalcs(all);
  const gal = (l: number | null) => (l == null ? null : s.volumeUnit === 'Gallons' ? l / 3.78541 : l);
  const mi = (km: number | null) => (km == null ? null : s.distanceUnit === 'Miles' ? km / 1.60934 : km);
  const vu = s.volumeUnit === 'Gallons' ? 'gal' : 'L';
  const du = s.distanceUnit === 'Miles' ? 'mi' : 'km';
  const eff = (l100: number | null) =>
    l100 == null ? null : s.efficiencyUnit === 'MPG (US)' ? 235.214583 / l100 : l100;
  const effCap = s.efficiencyUnit === 'MPG (US)' ? 'MPG' : 'L/100km';

  const compareOf = (fs: FuelCalc[]) => {
    const vals = fs.map((f) => f.per100).filter((x): x is number => x != null);
    if (vals.length < 2) return null;
    const half = Math.floor(vals.length / 2);
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const conv = (l100: number) => (s.efficiencyUnit === 'MPG (US)' ? 235.214583 / l100 : l100);
    return { first: conv(avg(vals.slice(0, half))), second: conv(avg(vals.slice(half))) };
  };

  const services = all.filter((r) => r.type === 'service');
  const expenses = all.filter((r) => r.type === 'expense');

  const spendingPoints = await getSpendingSeries([vehicleId], ['fuel', 'service', 'expense'], cutoff);

  return [
    {
      key: 'price',
      cap: `Price ($) / ${vu}`,
      title: `Fuel Price ($/${vu})`,
      kind: 'line',
      points: series(
        fuels.map((f) =>
          pt(f.datetime, f.pricePerUnit == null ? null : s.volumeUnit === 'Gallons' ? f.pricePerUnit * 3.78541 : f.pricePerUnit)
        )
      ),
      compareOf: null,
      fuels: null
    },
    {
      key: 'efficiency',
      cap: effCap,
      title: s.efficiencyUnit === 'MPG (US)' ? 'Fuel Efficiency (MPG)' : 'Fuel Efficiency (L/100km)',
      kind: 'line',
      points: series(fuels.map((f) => pt(f.datetime, eff(f.per100)))),
      compareOf: null,
      fuels: null
    },
    {
      key: 'fuel-cost',
      cap: 'Fuel Costs',
      title: 'Fuel Costs ($)',
      kind: 'line',
      points: series(fuels.map((f) => pt(f.datetime, f.totalCost))),
      compareOf: null,
      fuels: null
    },
    {
      key: 'volume',
      cap: `${vu} / FuelUp`,
      title: `Volume per Fuel-Up (${vu})`,
      kind: 'line',
      points: series(fuels.map((f) => pt(f.datetime, gal(f.volume)))),
      compareOf: null,
      fuels: null
    },
    {
      key: 'distance',
      cap: `${du} btwn FuelUps`,
      title: `Distance Between Fuel-Ups (${du})`,
      kind: 'line',
      points: series(fuels.map((f) => pt(f.datetime, mi(f.distSincePrev)))),
      compareOf: null,
      fuels: null
    },
    {
      key: 'time',
      cap: 'Time btwn FuelUps',
      title: 'Time Between Fuel-Ups (days)',
      kind: 'line',
      points: series(fuels.map((f) => pt(f.datetime, f.daysSincePrev))),
      compareOf: null,
      fuels: null
    },
    {
      key: 'avg-cmp',
      cap: s.efficiencyUnit === 'MPG (US)' ? 'Avg MPG Cmp.' : 'Avg L/100 Cmp.',
      title: 'Average Efficiency Comparison',
      kind: 'compare',
      points: [],
      compareOf,
      fuels
    },
    {
      key: 'service-cost',
      cap: 'Service Costs',
      title: 'Service Costs ($)',
      kind: 'line',
      points: series(services.map((r) => pt(r.datetime, r.totalCost))),
      compareOf: null,
      fuels: null
    },
    {
      key: 'expense-cost',
      cap: 'Expense Costs',
      title: 'Expense Costs ($)',
      kind: 'line',
      points: series(expenses.map((r) => pt(r.datetime, r.totalCost))),
      compareOf: null,
      fuels: null
    },
    {
      key: 'odometer',
      cap: 'Time - Odometer',
      title: `Odometer Over Time (${du})`,
      kind: 'line',
      points: series(all.filter((r) => r.odometer != null).map((r) => pt(r.datetime, mi(r.odometer)))),
      compareOf: null,
      fuels: null
    },
    {
      key: 'spending',
      cap: 'Spending',
      title: 'Spending ($)',
      kind: 'bars',
      points: spendingPoints,
      compareOf: null,
      fuels: null
    }
  ];
}

/**
 * Spending series: records with a cost, bucketed by calendar month,
 * one point per month that has spending. Shared by the Charts grid
 * (single vehicle, all types) and the Spending chart view, whose
 * All Vehicles / type toggles recompute it for other scopes.
 */
export async function getSpendingSeries(
  vehicleIds: number[],
  types: string[],
  cutoff?: string | null
): Promise<ChartPoint[]> {
  const byMonth = new Map<string, ChartPoint>();
  for (const vid of vehicleIds) {
    const rows = await getVehicleRecords(vid, cutoff);
    for (const r of rows) {
      if (r.totalCost == null || !types.includes(r.type)) continue;
      const d = new Date(r.datetime);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const cur = byMonth.get(key);
      if (cur) cur.v += r.totalCost;
      else byMonth.set(key, { t: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), v: r.totalCost });
    }
  }
  return [...byMonth.values()]
    .sort((a, b) => a.t - b.t)
    .map((p) => ({ t: p.t, v: Math.round(p.v * 100) / 100 }));
}

/** Scale a point series into a 100x80 sparkline polyline ('' if <2 points). */
export function sparkOf(points: ChartPoint[]): string {
  if (points.length < 2) return '';
  const vs = points.map((p) => p.v);
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  const range = max - min || 1;
  const step = 100 / (points.length - 1);
  return points.map((p, i) => `${(i * step).toFixed(1)},${(72 - ((p.v - min) / range) * 60).toFixed(1)}`).join(' ');
}
