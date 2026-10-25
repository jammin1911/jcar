import { records } from './db';
import { numOrNull } from './vehicles';
import type { Exec } from './versions';

// Bulk create the same service or expense record on a repeating
// schedule going backwards - insurance payments and the like that
// were never entered one by one. The newest record is the latest
// scheduled date on or before today, the rest step back from there.

export const BACKFILL_CAP = 1000;

export type BackfillFreq = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type BackfillRange = 'count' | 'date' | 'purchase';

export interface BackfillSpec {
  type: 'service' | 'expense';
  title: string;
  totalCost: number;
  notes: string;
  locationId: number | null;
  freq: BackfillFreq;
  every: number;
  dayOfWeek: number; // weekly, 0 = Sunday
  dayOfMonth: number; // monthly and yearly, 1..31, clamps to the month length
  month: number; // yearly, 1..12
  range: BackfillRange;
  count: number; // range = count
  until: string; // range = date, YYYY-MM-DD
}

export interface YMD {
  y: number;
  m: number;
  d: number;
}

const dim = (y: number, m: number) => new Date(y, m, 0).getDate();
const cmpYMD = (a: YMD, b: YMD) => a.y - b.y || a.m - b.m || a.d - b.d;
const clampDay = (y: number, m: number, day: number): YMD => ({ y, m, d: Math.min(day, dim(y, m)) });

export const todayYMD = (now = new Date()): YMD => ({
  y: now.getFullYear(),
  m: now.getMonth() + 1,
  d: now.getDate()
});

export function parseYMD(s: string): YMD | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const ymd = { y: +m[1], m: +m[2], d: +m[3] };
  if (ymd.m < 1 || ymd.m > 12 || ymd.d < 1 || ymd.d > dim(ymd.y, ymd.m)) return null;
  return ymd;
}

const addDays = (a: YMD, n: number): YMD => {
  const t = new Date(a.y, a.m - 1, a.d + n);
  return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() };
};

const monthStep = (a: YMD, n: number): YMD => {
  const t = new Date(a.y, a.m - 1 + n, 1);
  return { y: t.getFullYear(), m: t.getMonth() + 1, d: 1 };
};

/**
 * The scheduled dates, oldest first. Count mode stops after count
 * dates, the other modes stop before start (start itself counts).
 * The list can come back one past BACKFILL_CAP, the caller treats
 * that as over the limit.
 */
export function backfillDates(spec: BackfillSpec, start: YMD | null, today: YMD): YMD[] {
  let cand: YMD;
  if (spec.freq === 'daily') {
    cand = today;
  } else if (spec.freq === 'weekly') {
    const dow = new Date(today.y, today.m - 1, today.d).getDay();
    cand = addDays(today, -((dow - spec.dayOfWeek + 7) % 7));
  } else if (spec.freq === 'monthly') {
    cand = clampDay(today.y, today.m, spec.dayOfMonth);
    if (cmpYMD(cand, today) > 0) {
      const b = monthStep(cand, -spec.every);
      cand = clampDay(b.y, b.m, spec.dayOfMonth);
    }
  } else {
    cand = clampDay(today.y, spec.month, spec.dayOfMonth);
    if (cmpYMD(cand, today) > 0) cand = clampDay(today.y - spec.every, spec.month, spec.dayOfMonth);
  }

  const out: YMD[] = [];
  for (;;) {
    if (spec.range === 'count' && out.length >= spec.count) break;
    if (spec.range !== 'count' && start && cmpYMD(cand, start) < 0) break;
    out.push(cand);
    if (out.length > BACKFILL_CAP) break;
    if (spec.freq === 'daily') cand = addDays(cand, -spec.every);
    else if (spec.freq === 'weekly') cand = addDays(cand, -7 * spec.every);
    else if (spec.freq === 'monthly') {
      const b = monthStep(cand, -spec.every);
      cand = clampDay(b.y, b.m, spec.dayOfMonth);
    } else cand = clampDay(cand.y - spec.every, spec.month, spec.dayOfMonth);
  }
  return out.reverse();
}

/** A backfilled record sits at noon on its date, like it was typed in over lunch. */
export const backfillISO = (d: YMD) => new Date(d.y, d.m - 1, d.d, 12).toISOString();

const FIELDS = [
  'type',
  'title',
  'totalCost',
  'notes',
  'locationId',
  'freq',
  'every',
  'dayOfWeek',
  'dayOfMonth',
  'month',
  'range',
  'count',
  'until'
] as const;

export type BackfillValues = Record<(typeof FIELDS)[number], string>;

/** The submitted strings, echoed back so a form can re-render filled. */
export function echoBackfillValues(data: FormData): BackfillValues {
  const out = {} as BackfillValues;
  for (const f of FIELDS) out[f] = String(data.get(f) ?? '');
  return out;
}

const intField = (v: FormDataEntryValue | null, min: number, max: number): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

export function readBackfillForm(
  data: FormData
): { vehicleId: number; spec: BackfillSpec } | { error: string } {
  const vehicleId = Number(data.get('vehicleId')) || 0;
  if (!vehicleId) return { error: 'Pick a vehicle.' };

  const type = String(data.get('type') ?? '');
  if (type !== 'service' && type !== 'expense') return { error: 'Pick a record type.' };

  const title = String(data.get('title') ?? '').trim();
  if (!title) return { error: 'Enter a title, like Insurance.' };

  const totalCost = numOrNull(data.get('totalCost'));
  if (totalCost == null) return { error: 'Enter an amount for each record.' };
  if (totalCost < 0) return { error: "Amount can't be negative." };

  const freq = String(data.get('freq') ?? '');
  if (freq !== 'daily' && freq !== 'weekly' && freq !== 'monthly' && freq !== 'yearly') {
    return { error: 'Pick how often it repeats.' };
  }

  const every = intField(data.get('every'), 1, 52);
  if (every == null) return { error: 'Repeat count has to be a whole number from 1 to 52.' };

  const dayOfWeek = intField(data.get('dayOfWeek'), 0, 6);
  if (freq === 'weekly' && dayOfWeek == null) return { error: 'Pick a day of the week.' };

  const dayOfMonth = intField(data.get('dayOfMonth'), 1, 31);
  if ((freq === 'monthly' || freq === 'yearly') && dayOfMonth == null) {
    return { error: 'Pick a day of the month from 1 to 31.' };
  }

  const month = intField(data.get('month'), 1, 12);
  if (freq === 'yearly' && month == null) return { error: 'Pick a month.' };

  const range = String(data.get('range') ?? '');
  if (range !== 'count' && range !== 'date' && range !== 'purchase') {
    return { error: 'Pick how far back to go.' };
  }

  const count = intField(data.get('count'), 1, BACKFILL_CAP);
  if (range === 'count' && count == null) {
    return { error: `Number of payments has to be a whole number from 1 to ${BACKFILL_CAP}.` };
  }

  const until = String(data.get('until') ?? '');
  if (range === 'date' && !parseYMD(until)) return { error: 'Pick a valid back-to date.' };

  return {
    vehicleId,
    spec: {
      type,
      title,
      totalCost,
      notes: String(data.get('notes') ?? '').trim(),
      locationId: numOrNull(data.get('locationId')),
      freq,
      every,
      dayOfWeek: dayOfWeek ?? 1,
      dayOfMonth: dayOfMonth ?? 1,
      month: month ?? 1,
      range,
      count: count ?? 12,
      until
    }
  };
}

/** Insert one record per date, all inside the caller's transaction. */
export async function createBackfillRecords(
  userId: number,
  vehicleId: number,
  spec: BackfillSpec,
  dates: YMD[],
  exec: Exec
): Promise<void> {
  const createdAt = new Date().toISOString();
  for (const d of dates) {
    await exec.insert(records).values({
      vehicleId,
      userId,
      type: spec.type,
      title: spec.title,
      datetime: backfillISO(d),
      odometer: null,
      pricePerUnit: null,
      volume: null,
      totalCost: spec.totalCost,
      partial: 0,
      missed: 0,
      notes: spec.notes,
      locationId: spec.locationId,
      createdAt
    });
  }
}
