import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Cookies } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import { db, vehicleParts } from '$lib/server/db';
import { getSelectedVehicle, getVehicleAccess, getSettings, deleteVehicleCascade } from '$lib/server/vehicles';
import { getVehicleRecords } from '$lib/server/stats';
import { retentionCutoff } from '$lib/server/plans';
import { fmtNum, fmtDate } from '$lib/format';
import { fmtOdometer } from '$lib/odometer';

// Which vehicle this page is about: an explicit ?v=<id> (from Manage
// Vehicles, Edit) wins over the current selection, so any accessible
// vehicle can open here directly, even a disabled one. Load and
// actions resolve the same way, so they always act on what's shown.
async function resolveAccess(userId: number, cookies: Cookies, url: URL) {
  const explicitId = Number(url.searchParams.get('v'));
  return (
    (explicitId ? await getVehicleAccess(userId, explicitId) : null) ??
    (await getSelectedVehicle(cookies, userId))
  );
}

export const load: PageServerLoad = async ({ locals, cookies, url }) => {
  const user = locals.user!;
  const access = await resolveAccess(user.id, cookies, url);
  if (!access) throw redirect(303, '/vehicle/new');
  const v = access.vehicle;
  const settings = await getSettings(user.id);

  const all = await getVehicleRecords(v.id, await retentionCutoff(user.id), v.costTracking === 1);
  const odos = all.filter((r) => r.odometer != null).map((r) => r.odometer as number);
  const lastOdometer = odos.length ? Math.max(...odos) : null;

  const parts = await db
    .select()
    .from(vehicleParts)
    .where(eq(vehicleParts.vehicleId, v.id))
    .orderBy(asc(vehicleParts.id));

  const dash = (x: string | number | null | undefined) =>
    x === null || x === undefined || x === '' ? '' : String(x);
  // Purchased and Sold dates are stored as YYYY-MM-DD, render them in
  // the user's date format. Free-text values pass through as-is.
  const plainDate = (x: string | null | undefined) => {
    if (!x) return '';
    return /^\d{4}-\d{2}-\d{2}$/.test(x) ? fmtDate(x + 'T12:00:00', settings) : x;
  };
  const money = (n: number | null) => (n == null ? '' : `$${fmtNum(n, 2)}`);
  const num = (n: number | null) => (n == null ? '' : fmtNum(n));

  return {
    isOwner: access.isOwner,
    ownerName: access.ownerName,
    settings,
    parts: parts.map((p) => ({
      id: p.id,
      name: p.name,
      detail: [p.brand, p.type, p.partNumber ? `#${p.partNumber}` : ''].filter(Boolean).join(' · ')
    })),
    top: [
      ['Year', dash(v.year)],
      ['Make', dash(v.make)],
      ['Model', dash(v.model)],
      ['Submodel', dash(v.submodel)],
      ['Engine', dash(v.engine)],
      ['Transmission', dash(v.transmission)],
      ['Drive Type', dash(v.driveType)],
      ['Body Type', dash(v.bodyType)]
    ] as [string, string][],
    units: [
      ['Distance Unit', dash(v.distanceUnit)],
      ['Volume Unit', dash(v.volumeUnit)]
    ] as [string, string][],
    rest: [
      ['Last Odometer', lastOdometer != null ? `${fmtNum(lastOdometer)} ${v.distanceUnit === 'Miles' ? 'mi' : 'km'}` : ''],
      ['License Plate', dash(v.licensePlate)],
      ['VIN', dash(v.vin)],
      ['Tank Capacity', v.tankCapacity != null ? `${fmtNum(v.tankCapacity)} ${v.volumeUnit === 'Gallons' ? 'gal' : 'L'}` : ''],
      ['Notes', dash(v.notes)]
    ] as [string, string][],
    purchased: [
      ['Odometer', fmtOdometer(v.purchasedOdometer)],
      ['Price', money(v.purchasedPrice)],
      ['Date', plainDate(v.purchasedDate)],
      ['Notes', dash(v.purchasedNotes)]
    ] as [string, string][],
    sold: [
      ['Odometer', fmtOdometer(v.soldOdometer)],
      ['Price', money(v.soldPrice)],
      ['Date', plainDate(v.soldDate)],
      ['Notes', dash(v.soldNotes)]
    ] as [string, string][],
    vehicleId: v.id,
    vehicleName: v.name
  };
};

export const actions: Actions = {
  deleteVehicle: async ({ locals, cookies, url }) => {
    const user = locals.user!;
    const access = await resolveAccess(user.id, cookies, url);
    if (!access) throw redirect(303, '/vehicle/new');
    if (!access.isOwner) return fail(403, { shareError: 'Only the owner can delete this vehicle' });
    await db.transaction(async (tx) => {
      await deleteVehicleCascade(access.vehicle.id, tx);
    });
    cookies.delete('jcar_vehicle', { path: '/' });
    throw redirect(303, '/');
  }
};
