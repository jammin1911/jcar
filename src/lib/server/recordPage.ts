import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db, locations, records } from './db';
import { getSelectedVehicle, getSettings, numOrNull } from './vehicles';
import { getVehicleRecords } from './stats';
import { nowLocalInput, fmtDateTime, fmtNum, distLabel, type DisplaySettings } from '$lib/format';
import { fmtOdometer, ungroupOdometer } from '$lib/odometer';
import { getRecordPhotos } from './photos';

export type RecordKind = 'fuel' | 'service' | 'expense' | 'note';

/** The record being edited via ?edit=<id> on an entry page, or null. */
export async function getEditableRecord(vehicleId: number, kind: RecordKind, editId: number) {
  if (!editId) return null;
  const rows = await db.select().from(records).where(eq(records.id, editId)).limit(1);
  const r = rows[0];
  if (!r || r.vehicleId !== vehicleId || r.type !== kind) return null;
  return r;
}

export interface EditingState {
  id: number;
  values: {
    odometer: string;
    price: string;
    volume: string;
    totalCost: string;
    notes: string;
    partial: boolean;
    missed: boolean;
    datetime: string;
  };
  photos: { id: number; bytes: number }[];
}

const numStr = (v: number | null | undefined) => (v == null ? '' : String(v));

/** Shared load for the record entry pages (fuel/service/expense/note). */
export async function loadRecordPage(
  locals: App.Locals,
  cookies: import('@sveltejs/kit').Cookies,
  url: URL,
  kind?: RecordKind
) {
  const user = locals.user!;
  const access = await getSelectedVehicle(cookies, user.id);
  if (!access) throw redirect(303, '/vehicle/new');
  const vehicle = access.vehicle;

  const all = await getVehicleRecords(vehicle.id);
  const odos = all.filter((r) => r.odometer != null).map((r) => r.odometer as number);
  const prevOdometer = odos.length ? Math.max(...odos) : vehicle.purchasedOdometer;

  // Editing an existing record (?edit=<id>): prefill the form with it.
  let editing: EditingState | null = null;
  let editLocationId: number | null = null;
  const editId = Number(url.searchParams.get('edit')) || 0;
  if (kind && editId) {
    const rec = await getEditableRecord(vehicle.id, kind, editId);
    if (!rec) throw redirect(303, '/browse');
    editing = {
      id: rec.id,
      values: {
        odometer: fmtOdometer(rec.odometer),
        price: numStr(rec.pricePerUnit),
        volume: numStr(rec.volume),
        totalCost: numStr(rec.totalCost),
        notes: rec.notes ?? '',
        partial: rec.partial === 1,
        missed: rec.missed === 1,
        datetime: nowLocalInput(new Date(rec.datetime))
      },
      photos: await getRecordPhotos(rec.id)
    };
    editLocationId = rec.locationId ?? null;
  }

  let locationId: number | null = null;
  let locationLabel = '';
  const locParam = Number(url.searchParams.get('locationId'));
  const wantedLoc = locParam || editLocationId;
  if (wantedLoc) {
    const rows = await db.select().from(locations).where(eq(locations.id, wantedLoc)).limit(1);
    const loc = rows[0];
    // A location from the picker has to be the users own. A records
    // existing location is only displayed, it might belong to the
    // vehicle owner when a shared user is editing.
    if (loc && (locParam ? loc.userId === user.id : true)) {
      locationId = loc.id;
      locationLabel = [loc.street, loc.city].filter(Boolean).join(', ');
    }
  }

  return {
    vehicleName: vehicle.name,
    vehicleId: vehicle.id,
    costTracking: vehicle.costTracking === 1,
    prevOdometer: prevOdometer != null ? fmtOdometer(prevOdometer) : '----------',
    defaultDateTime: nowLocalInput(),
    locationId,
    locationLabel,
    editing,
    settings: await getSettings(user.id)
  };
}

/** Submitted values echoed back after a validation failure, so the
 *  re-rendered form keeps everything the user typed. */
export async function failValues(userId: number, input: RecordInput) {
  let locationLabel = '';
  if (input.locationId) {
    const rows = await db.select().from(locations).where(eq(locations.id, input.locationId)).limit(1);
    const loc = rows[0];
    if (loc && loc.userId === userId) {
      locationLabel = [loc.street, loc.city].filter(Boolean).join(', ');
    }
  }
  return {
    values: {
      odometer: fmtOdometer(input.odometer),
      price: numStr(input.pricePerUnit),
      volume: numStr(input.volume),
      totalCost: numStr(input.totalCost),
      notes: input.notes,
      partial: input.partial,
      missed: input.missed,
      datetime: nowLocalInput(new Date(input.datetime))
    },
    locationId: input.locationId,
    locationLabel
  };
}

export interface RecordInput {
  type: 'fuel' | 'service' | 'expense' | 'note';
  datetime: string;
  odometer: number | null;
  pricePerUnit: number | null;
  volume: number | null;
  totalCost: number | null;
  partial: boolean;
  missed: boolean;
  notes: string;
  locationId: number | null;
}

export function readRecordForm(data: FormData, type: RecordInput['type']): RecordInput {
  const dtRaw = String(data.get('datetime') ?? '');
  const dt = dtRaw ? new Date(dtRaw) : new Date();
  const locId = numOrNull(data.get('locationId'));
  return {
    type,
    datetime: isNaN(dt.getTime()) ? new Date().toISOString() : dt.toISOString(),
    odometer: numOrNull(ungroupOdometer(data.get('odometer'))),
    pricePerUnit: numOrNull(data.get('price')),
    volume: numOrNull(data.get('volume')),
    totalCost: numOrNull(data.get('totalCost')),
    partial: data.get('partial') === 'on',
    missed: data.get('missed') === 'on',
    notes: String(data.get('notes') ?? '').trim(),
    locationId: locId
  };
}

/**
 * Sanity checks for a new record. Values can't be negative and the
 * odometer can never go backwards over time. All record types share
 * one odometer timeline per vehicle, so a new reading is checked
 * against the nearest records before and after it in time, a
 * backdated entry has to fit between its neighbours. Returns an
 * error message for the user, or null when the record is fine.
 */
export async function validateRecordInput(
  vehicleId: number,
  input: RecordInput,
  settings: DisplaySettings,
  excludeId = 0
): Promise<string | null> {
  const amounts: [string, number | null][] = [
    ['Odometer', input.odometer],
    ['Price', input.pricePerUnit],
    ['Volume', input.volume],
    ['Total Cost', input.totalCost]
  ];
  for (const [label, val] of amounts) {
    if (val != null && val < 0) return `${label} can't be negative.`;
  }
  if (input.odometer == null) return null;

  const all = await getVehicleRecords(vehicleId);
  const withOdo = all.filter((r) => r.odometer != null && r.id !== excludeId);
  const t = new Date(input.datetime).getTime();
  const before = withOdo.filter((r) => new Date(r.datetime).getTime() <= t);
  const after = withOdo.filter((r) => new Date(r.datetime).getTime() > t);
  const prev = before[before.length - 1];
  const next = after[0];
  const unit = distLabel(settings);
  const mine = fmtNum(input.odometer, 1);

  if (prev && input.odometer < (prev.odometer as number)) {
    return (
      `Odometer ${mine} ${unit} is lower than the ${fmtNum(prev.odometer, 1)} ${unit} ` +
      `already recorded on ${fmtDateTime(prev.datetime, settings)}. ` +
      `Odometers can't go backwards - check the reading or the date/time.`
    );
  }
  if (next && input.odometer > (next.odometer as number)) {
    return (
      `Odometer ${mine} ${unit} is higher than the ${fmtNum(next.odometer, 1)} ${unit} ` +
      `recorded later, on ${fmtDateTime(next.datetime, settings)}. ` +
      `Odometers can't go backwards - check the reading or the date/time.`
    );
  }
  return null;
}

function deriveFuel(input: RecordInput) {
  // Derive what we can: total cost from price x volume, price from total/volume.
  let { totalCost, pricePerUnit, volume } = input;
  if (input.type === 'fuel') {
    if (totalCost == null && pricePerUnit != null && volume != null) totalCost = pricePerUnit * volume;
    if (pricePerUnit == null && totalCost != null && volume != null && volume > 0) pricePerUnit = totalCost / volume;
  }
  return { totalCost, pricePerUnit, volume };
}

export async function insertRecord(userId: number, vehicleId: number, input: RecordInput): Promise<number> {
  const { totalCost, pricePerUnit, volume } = deriveFuel(input);
  const rows = await db
    .insert(records)
    .values({
      vehicleId,
      userId,
      type: input.type,
      datetime: input.datetime,
      odometer: input.odometer,
      pricePerUnit,
      volume,
      totalCost,
      partial: input.partial ? 1 : 0,
      missed: input.missed ? 1 : 0,
      notes: input.notes,
      locationId: input.locationId,
      createdAt: new Date().toISOString()
    })
    .returning({ id: records.id });
  return rows[0].id;
}

/** Update an existing record from form input (title and author preserved). */
export async function updateRecord(recordId: number, input: RecordInput): Promise<void> {
  const { totalCost, pricePerUnit, volume } = deriveFuel(input);
  await db
    .update(records)
    .set({
      datetime: input.datetime,
      odometer: input.odometer,
      pricePerUnit,
      volume,
      totalCost,
      partial: input.partial ? 1 : 0,
      missed: input.missed ? 1 : 0,
      notes: input.notes,
      locationId: input.locationId
    })
    .where(eq(records.id, recordId));
}
