import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getSelectedVehicle, getSettings, getUserVehicles } from '$lib/server/vehicles';
import { getCharts, getSpendingSeries, type ChartPoint } from '$lib/server/charts';
import { retentionCutoff } from '$lib/server/plans';
import { fmtDate } from '$lib/format';

const RANGES: { key: string; label: string; stack?: [string, string]; months: number }[] = [
  // months: -1 = the current calendar month (see the window logic).
  { key: 'this-month', label: 'This Month', stack: ['THIS', 'MONTH'], months: -1 },
  { key: '1m', label: '1M', months: 1 },
  { key: '3m', label: '3M', months: 3 },
  { key: '6m', label: '6M', months: 6 },
  { key: '1y', label: '1Y', months: 12 },
  { key: 'all', label: 'All', months: 0 }
];

function fmtVal(v: number): string {
  const a = Math.abs(v);
  return v.toFixed(a >= 1000 ? 0 : a >= 100 ? 0 : a >= 10 ? 1 : 2);
}

/**
 * Display smoothing: a centred moving average over the values, window
 * about 1/10 of the series, two passes so spikes melt into the trend.
 * It averages the raw values before scaling, and the smoothed chart
 * gets its own y scale and its own stats so an outlier can't flatten
 * it.
 */
function movingAverage(pts: { x: number; y: number }[]): { x: number; y: number }[] {
  const n = pts.length;
  if (n < 3) return pts;
  let w = Math.max(3, Math.min(41, Math.round(n / 10)));
  if (w % 2 === 0) w += 1;
  let cur = pts;
  for (let pass = 0; pass < 2; pass++) {
    const half = Math.floor(w / 2);
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - half);
      const b = Math.min(n - 1, i + half);
      let sum = 0;
      for (let j = a; j <= b; j++) sum += cur[j].y;
      out.push({ x: cur[i].x, y: sum / (b - a + 1) });
    }
    cur = out;
  }
  return cur;
}

/** Catmull-Rom spline through the points, as an SVG cubic Bézier path. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 3) {
    return `M ${pts[0].x},${pts[0].y} L ${pts[pts.length - 1].x},${pts[pts.length - 1].y}`;
  }
  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

export const load: PageServerLoad = async ({ locals, cookies, url }) => {
  const user = locals.user!;
  const access = await getSelectedVehicle(cookies, user.id);
  if (!access) throw redirect(303, '/vehicle/new');
  const s = await getSettings(user.id);
  const defs = await getCharts(access.vehicle.id, s, await retentionCutoff(user.id), access.vehicle.costTracking === 1);
  const key = url.searchParams.get('chart') ?? '';
  const def = defs.find((d) => d.key === key);
  if (!def) throw redirect(303, '/charts');

  const rangeParam = url.searchParams.get('range') ?? 'all';
  const range = RANGES.some((r) => r.key === rangeParam) ? rangeParam : 'all';
  const months = RANGES.find((r) => r.key === range)!.months;

  // The period is anchored at the newest data point (not wall-clock now),
  // so historical data still filters sensibly. The one exception is
  // "This Month", which means the current calendar month by the clock.
  const allTimes =
    def.kind === 'compare'
      ? (def.fuels ?? []).map((f) => new Date(f.datetime).getTime())
      : def.points.map((p) => p.t);
  const end = allTimes.length ? Math.max(...allTimes) : Date.now();
  let cutoff: number;
  if (range === 'this-month') {
    const now = new Date();
    cutoff = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  } else if (months > 0) {
    const cutoffDate = new Date(end);
    cutoffDate.setMonth(cutoffDate.getMonth() - months);
    cutoff = cutoffDate.getTime();
  } else {
    cutoff = Number.NEGATIVE_INFINITY;
  }

  // Spending chart toggles (All Vehicles plus record types). The
  // state lives in the URL and the range chips carry it, so switching
  // period keeps the toggles. `tf` marks that types were submitted,
  // so an all-off selection reads differently from never touching them.
  const SPEND_TYPES = ['fuel', 'service', 'expense'];
  const spendAll = url.searchParams.get('veh') === 'all';
  const typesCustom = url.searchParams.has('tf') || url.searchParams.has('types');
  const rawTypes = url.searchParams.getAll('types').flatMap((v) => v.split(',')).filter(Boolean);
  const spendTypes = typesCustom ? SPEND_TYPES.filter((t) => rawTypes.includes(t)) : [...SPEND_TYPES];
  const spendExtra =
    key === 'spending'
      ? `${spendAll ? '&veh=all' : ''}${typesCustom ? `&tf=1${spendTypes.length ? `&types=${spendTypes.join(',')}` : ''}` : ''}`
      : '';

  const ranges = RANGES.map((r) => ({
    ...r,
    active: r.key === range,
    href: `/charts/view?chart=${key}&range=${r.key}${spendExtra}`
  }));

  if (def.kind === 'compare') {
    const inWindow = (def.fuels ?? []).filter((f) => new Date(f.datetime).getTime() >= cutoff);
    const cmp = def.compareOf ? def.compareOf(inWindow) : null;
    return {
      title: def.title,
      kind: 'compare' as const,
      ranges,
      cmp: cmp ? { ...cmp, max: Math.max(cmp.first, cmp.second) || 1 } : null,
      count: inWindow.length,
    };
  }

  if (def.kind === 'bars') {
    // Bars are positioned on the time axis, so months with no spending
    // show as gaps. One month of data is a valid chart here.
    let srcPoints = def.points;
    if (spendAll || typesCustom) {
      const ids = spendAll
        ? (await getUserVehicles(user.id)).filter((a) => a.vehicle.active === 1).map((a) => a.vehicle.id)
        : [access.vehicle.id];
      srcPoints = await getSpendingSeries(ids, spendTypes, await retentionCutoff(user.id));
    }
    const pts = srcPoints.filter((p) => p.t >= cutoff);
    const W = 400;
    const H = 250;
    const L = 46;
    const R = 8;
    const T = 12;
    const B = 28;
    type BarGeom = {
      rects: { x: number; y: number; w: number; h: number; tx: number; val: string | null }[];
      yMax: string;
      yMid: string;
      midY: number;
      startLabel: string;
      endLabel: string;
      total: string;
    };
    let bars: BarGeom | null = null;
    let bStats: { min: string; avg: string; max: string } | null = null;
    if (pts.length >= 1) {
      const first = pts[0].t;
      const lastD = new Date(pts[pts.length - 1].t);
      const spanEnd = new Date(lastD.getFullYear(), lastD.getMonth() + 1, 1).getTime();
      const spanMonths = Math.max(1, Math.round((spanEnd - first) / (30.44 * 86400000)));
      const plotW = W - L - R;
      const slot = plotW / spanMonths;
      const barW = Math.max(1.5, slot * 0.68);
      const vals = pts.map((p) => p.v);
      const vmax = Math.max(...vals) || 1;
      const hi = vmax * 1.06;
      const Y = (v: number) => T + (1 - v / hi) * (H - T - B);
      const base = Y(0);
      const rects = pts.map((p) => {
        const slotX = L + ((p.t - first) / (spanEnd - first)) * plotW;
        const x = slotX + (slot - barW) / 2;
        const y = Y(p.v);
        return {
          x: Number(x.toFixed(1)),
          y: Number(y.toFixed(1)),
          w: Number(barW.toFixed(1)),
          h: Number((base - y).toFixed(1)),
          tx: Number((x + barW / 2).toFixed(1)),
          val: spanMonths <= 18 ? fmtVal(p.v) : null
        };
      });
      const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const lbl = (t: number) => {
        const d = new Date(t);
        return `${MN[d.getMonth()]} ${d.getFullYear()}`;
      };
      bStats = {
        min: fmtVal(Math.min(...vals)),
        avg: fmtVal(vals.reduce((a, b) => a + b, 0) / vals.length),
        max: fmtVal(vmax)
      };
      bars = {
        rects,
        yMax: fmtVal(vmax),
        yMid: fmtVal(vmax / 2),
        midY: Number(Y(vmax / 2).toFixed(1)),
        startLabel: lbl(first),
        endLabel: lbl(pts[pts.length - 1].t),
        total: fmtVal(vals.reduce((a, b) => a + b, 0))
      };
    }
    return {
      title: def.title,
      kind: 'bars' as const,
      ranges,
      range,
      bars,
      stats: bStats,
      count: pts.length,
      spend: {
        all: spendAll,
        typeOptions: [
          { key: 'fuel', label: 'Fuel', on: spendTypes.includes('fuel') },
          { key: 'service', label: 'Service', on: spendTypes.includes('service') },
          { key: 'expense', label: 'Expenses', on: spendTypes.includes('expense') }
        ]
      }
    };
  }

  const pts = def.points.filter((p) => p.t >= cutoff);
  // Big chart geometry: 400x250 viewBox, y labels left, dates below.
  // Raw and smoothed each get their own y scale. On one shared scale
  // a single outlier (a $7.30/L fill among $1.40 ones) would flatten
  // the smoothed trend against the bottom. The page renders both and
  // the toggle picks which scale, and which stats, are on screen.
  const W = 400;
  const H = 250;
  const L = 46;
  const R = 8;
  const T = 12;
  const B = 28;
  type Geom = {
    yMin: string;
    yMid: string;
    yMax: string;
    stats: { min: string; avg: string; max: string };
  };
  let chart: {
    raw: Geom & { line: string; dots: { x: number; y: number }[] };
    smooth: Geom & { path: string };
    midY: number;
    startLabel: string;
    endLabel: string;
  } | null = null;
  let stats: { raw: Geom['stats']; smooth: Geom['stats'] } | null = null;

  if (pts.length >= 2) {
    let tmin = Math.min(...pts.map((p) => p.t));
    let tmax = Math.max(...pts.map((p) => p.t));
    if (tmax - tmin < 86400000) {
      tmin -= 43200000;
      tmax += 43200000;
    }
    const X = (t: number) => L + ((t - tmin) / (tmax - tmin)) * (W - L - R);
    const geom = (vals: number[]) => {
      let vmin = Math.min(...vals);
      let vmax = Math.max(...vals);
      if (vmax - vmin < 1e-9) {
        vmin -= 1;
        vmax += 1;
      }
      const pad = (vmax - vmin) * 0.06;
      const lo = vmin - pad;
      const hi = vmax + pad;
      const Y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
      const scaled = pts.map((p, i) => ({
        x: Number(X(p.t).toFixed(1)),
        y: Number(Y(vals[i]).toFixed(1))
      }));
      const g: Geom & { scaled: { x: number; y: number }[] } = {
        scaled,
        yMin: fmtVal(vmin),
        yMid: fmtVal((vmin + vmax) / 2),
        yMax: fmtVal(vmax),
        stats: {
          min: fmtVal(vmin),
          avg: fmtVal(vals.reduce((a, b) => a + b, 0) / vals.length),
          max: fmtVal(vmax)
        }
      };
      return g;
    };
    const gRaw = geom(pts.map((p) => p.v));
    const smoothVals = movingAverage(pts.map((p) => ({ x: p.t, y: p.v }))).map((q) => q.y);
    const gSmooth = geom(smoothVals);
    chart = {
      raw: {
        line: gRaw.scaled.map((p) => `${p.x},${p.y}`).join(' '),
        dots: pts.length <= 80 ? gRaw.scaled : [],
        yMin: gRaw.yMin,
        yMid: gRaw.yMid,
        yMax: gRaw.yMax,
        stats: gRaw.stats
      },
      smooth: {
        path: smoothPath(gSmooth.scaled),
        yMin: gSmooth.yMin,
        yMid: gSmooth.yMid,
        yMax: gSmooth.yMax,
        stats: gSmooth.stats
      },
      midY: Number((T + (H - T - B) / 2).toFixed(1)),
      startLabel: fmtDate(new Date(tmin).toISOString(), s),
      endLabel: fmtDate(new Date(tmax).toISOString(), s)
    };
    stats = { raw: gRaw.stats, smooth: gSmooth.stats };
  }

  return {
    title: def.title,
    kind: 'line' as const,
    ranges,
    chart,
    stats,
    count: pts.length,
  };
};
