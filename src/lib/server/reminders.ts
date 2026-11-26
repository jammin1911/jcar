import { asc, eq, sql } from 'drizzle-orm';
import { db, records, reminders } from './db';

// Service reminders: a reminder fires on distance, on time, or on
// whichever comes first. Due state is worked out fresh from the
// stored due values on every page load, nothing is cached, so what
// the user sees is always current.

export type ReminderRow = typeof reminders.$inferSelect;

/** The standard service items. The keys are what the AI Auto Fill
 * answers with, the names double as suggestions on the reminder form. */
export const REMINDER_ITEMS: { key: string; name: string }[] = [
  { key: 'oil_change', name: 'Engine Oil' },
  { key: 'tire_rotation', name: 'Tire Rotation' },
  { key: 'engine_air_filter', name: 'Engine Air Filter' },
  { key: 'cabin_air_filter', name: 'Cabin Air Filter' },
  { key: 'brake_fluid', name: 'Brake Fluid' },
  { key: 'coolant', name: 'Coolant' },
  { key: 'transmission_fluid', name: 'Transmission Fluid' },
  { key: 'differential_fluid', name: 'Differential Fluid' },
  { key: 'transfer_case_fluid', name: 'Transfer Case Fluid' },
  { key: 'spark_plugs', name: 'Spark Plugs' },
  { key: 'timing_belt', name: 'Timing Belt' },
  { key: 'drive_belt', name: 'Drive Belt' },
  { key: 'fuel_filter', name: 'Fuel Filter' }
];

/** A reminder counts as due soon inside these windows. */
export const DUE_SOON_KM = 500;
export const DUE_SOON_DAYS = 7;

export type ReminderState = 'overdue' | 'soon' | 'upcoming';

export interface ReminderView {
  row: ReminderRow;
  state: ReminderState;
  /** km until the distance trigger fires, negative when overdue,
   * null when the reminder has no distance trigger or the vehicle
   * has no odometer reading yet */
  kmLeft: number | null;
  /** days until the date trigger fires, negative when overdue,
   * null when the reminder has no date trigger */
  daysLeft: number | null;
}

/** Today as an ISO date in the servers local time. */
export function todayIso(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Whole days from one ISO date to another, negative when past. */
export function daysUntil(fromIso: string, toIso: string): number {
  const a = fromIso.split('-').map(Number);
  const b = toIso.split('-').map(Number);
  const ms = Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2]);
  return Math.round(ms / 86400000);
}

/** An ISO date plus whole months, the day clamps to the months length. */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${ny}-${p(nm)}-${p(Math.min(d, lastDay))}`;
}

export async function getVehicleReminders(vehicleId: number): Promise<ReminderRow[]> {
  return db.select().from(reminders).where(eq(reminders.vehicleId, vehicleId)).orderBy(asc(reminders.id));
}

/** The highest odometer reading on any of the vehicles records. */
export async function latestOdometer(vehicleId: number): Promise<number | null> {
  const rows = await db
    .select({ max: sql<number | null>`max(${records.odometer})` })
    .from(records)
    .where(eq(records.vehicleId, vehicleId));
  return rows[0]?.max ?? null;
}

export function reminderView(row: ReminderRow, latestOdo: number | null, today: string): ReminderView {
  const kmLeft =
    row.nextDueOdometer != null && latestOdo != null ? row.nextDueOdometer - latestOdo : null;
  const daysLeft = row.nextDueDate ? daysUntil(today, row.nextDueDate) : null;
  let state: ReminderState = 'upcoming';
  if ((kmLeft != null && kmLeft < 0) || (daysLeft != null && daysLeft < 0)) {
    state = 'overdue';
  } else if (
    (kmLeft != null && kmLeft <= DUE_SOON_KM) ||
    (daysLeft != null && daysLeft <= DUE_SOON_DAYS)
  ) {
    state = 'soon';
  }
  return { row, state, kmLeft, daysLeft };
}

/** Reminders with their due state, most urgent first. */
export async function getReminderViews(vehicleId: number): Promise<ReminderView[]> {
  const [rows, odo] = await Promise.all([getVehicleReminders(vehicleId), latestOdometer(vehicleId)]);
  const today = todayIso();
  const views = rows.map((r) => reminderView(r, odo, today));
  const rank = { overdue: 0, soon: 1, upcoming: 2 } as const;
  const key = (v: ReminderView) => [
    rank[v.state],
    v.daysLeft ?? Number.POSITIVE_INFINITY,
    v.kmLeft ?? Number.POSITIVE_INFINITY
  ];
  views.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] !== kb[i]) return ka[i] - kb[i];
    }
    return a.row.id - b.row.id;
  });
  return views;
}

/** How many of the vehicles reminders are due soon or overdue,
 * what the dashboard badge shows. */
export async function countDueReminders(vehicleId: number): Promise<number> {
  const views = await getReminderViews(vehicleId);
  return views.filter((v) => v.state !== 'upcoming').length;
}

/**
 * Where a reminder lands when the user marks it done. Each trigger
 * with an interval rolls forward by that interval from its current
 * due value, a trigger with a due value but no interval is used up
 * and clears. Returns null when nothing repeats, the caller deletes
 * the reminder instead.
 */
export function advancedDue(
  row: ReminderRow,
  latestOdo: number | null,
  today: string
): { nextDueOdometer: number | null; nextDueDate: string | null } | null {
  if (row.distanceIntervalKm == null && row.timeIntervalMonths == null) return null;
  let nextDueOdometer: number | null = null;
  if (row.distanceIntervalKm != null) {
    nextDueOdometer =
      row.nextDueOdometer != null
        ? row.nextDueOdometer + row.distanceIntervalKm
        : latestOdo != null
          ? latestOdo + row.distanceIntervalKm
          : null;
  }
  let nextDueDate: string | null = null;
  if (row.timeIntervalMonths != null) {
    nextDueDate = addMonths(row.nextDueDate ?? today, row.timeIntervalMonths);
  }
  return { nextDueOdometer, nextDueDate };
}
