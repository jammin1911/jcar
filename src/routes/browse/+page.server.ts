import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { and, eq, inArray } from 'drizzle-orm';
import { db, recordPhotos, users, vehicleShares } from '$lib/server/db';
import { getSelectedVehicle, getSettings, getUserVehicles } from '$lib/server/vehicles';
import { getVehicleRecords, fuelCalcs, fuelSegments } from '$lib/server/stats';
import { parseBrowseFilter, rangeWindow, filterQuery } from '$lib/server/browseFilter';
import { retentionCutoff } from '$lib/server/plans';
import { fmtDateTime, fmtMoney, fmtNum, effValue, effUnitLabel, volValue, volLabel, distLabel } from '$lib/format';

export const load: PageServerLoad = async ({ locals, cookies, url }) => {
  const user = locals.user!;
  const accessible = await getUserVehicles(user.id);
  if (!accessible.length) throw redirect(303, '/vehicle/new');
  const settings = await getSettings(user.id);
  const selected = await getSelectedVehicle(cookies, user.id);
  const defaultVehicleId = selected?.vehicle.id ?? accessible[0].vehicle.id;

  const filter = parseBrowseFilter(
    url,
    accessible.map((a) => a.vehicle.id),
    defaultVehicleId
  );
  const win = rangeWindow(filter);
  const inWindow = (iso: string) => {
    if (!win) return true;
    const t = new Date(iso).getTime();
    return t >= win.start && t < win.end;
  };
  const nameOf = new Map(accessible.map((a) => [a.vehicle.id, a.vehicle.name]));
  const costTrackingOf = new Map(accessible.map((a) => [a.vehicle.id, a.vehicle.costTracking === 1]));
  const multi = filter.vehicleIds.length > 1;
  // Plan retention: records older than the viewer's cutoff are hidden.
  const cutoff = await retentionCutoff(user.id);

  // A vehicle counts as shared when the viewer got it through a share
  // or someone else holds an accepted share on it. Only rows on shared
  // vehicles show who recorded them.
  const sharedIds = new Set<number>(accessible.filter((a) => !a.isOwner).map((a) => a.vehicle.id));
  const ownedFiltered = filter.vehicleIds.filter((id) => !sharedIds.has(id));
  if (ownedFiltered.length) {
    const shareRows = await db
      .select({ vehicleId: vehicleShares.vehicleId })
      .from(vehicleShares)
      .where(and(inArray(vehicleShares.vehicleId, ownedFiltered), eq(vehicleShares.status, 'accepted')));
    for (const s of shareRows) sharedIds.add(s.vehicleId);
  }

  interface RowOut {
    id: number;
    vehicleId: number;
    userId: number;
    recordedBy: string;
    type: string;
    href: string;
    vehicleName: string;
    t: number;
    line1: string[];
    cost: string;
    costNum: number;
    odometer: string;
    date: string;
    photoCount: number;
  }
  const rows: RowOut[] = [];
  let segVol = 0;
  let segDist = 0;

  for (const vid of filter.vehicleIds) {
    const all = await getVehicleRecords(vid, cutoff, costTrackingOf.get(vid) ?? false);
    const fuels = fuelCalcs(all);
    const fuelById = new Map(fuels.map((f) => [f.id, f]));
    const byId = new Map(all.map((r) => [r.id, r]));

    // Efficiency average over segments whose closing fill lands in the
    // window. Segments come from the full history so the edges stay
    // right, and no efficiency shows when fuel-ups are filtered out.
    if (filter.types.includes('fuel')) {
      for (const seg of fuelSegments(all)) {
        const endRec = byId.get(seg.endId);
        if (endRec && inWindow(endRec.datetime)) {
          segVol += seg.vol;
          segDist += seg.dist;
        }
      }
    }

    for (const r of all) {
      if (!filter.types.includes(r.type)) continue;
      if (!inWindow(r.datetime)) continue;
      const date = fmtDateTime(r.datetime, settings);
      const href = `${r.type === 'fuel' ? '/fuel-up' : r.type === 'service' ? '/service' : r.type === 'expense' ? '/expense' : '/notes/new'}?edit=${r.id}`;
      const base = {
        id: r.id,
        vehicleId: vid,
        userId: r.userId,
        recordedBy: '',
        type: r.type as string,
        href,
        vehicleName: nameOf.get(vid) ?? '',
        t: new Date(r.datetime).getTime(),
        costNum: r.totalCost ?? 0,
        date,
        photoCount: 0
      };
      if (r.type === 'fuel') {
        const f = fuelById.get(r.id);
        rows.push({
          ...base,
          line1: [
            `${fmtNum(volValue(r.volume ?? 0, settings), 2)}${volLabel(settings)}`,
            f?.per100 != null ? `${effValue(f.per100, settings).toFixed(1)}${effUnitLabel(settings)}` : '-',
            r.pricePerUnit != null
              ? `$${(settings.volumeUnit === 'Gallons' ? r.pricePerUnit * 3.78541 : r.pricePerUnit).toFixed(3)}/${volLabel(settings)}`
              : '-'
          ],
          cost: fmtMoney(r.totalCost),
          odometer: r.odometer != null ? `@${fmtNum(r.odometer)}${distLabel(settings)}` : ''
        });
      } else if (r.type === 'service' || r.type === 'expense') {
        // The headline is the record title (its aCar subtype name, like
        // "Insurance"), falling back to notes, then the type name.
        const headline = r.title?.trim() || r.notes?.trim() || (r.type === 'service' ? 'Service' : 'Expense');
        rows.push({
          ...base,
          line1: [headline],
          cost: fmtMoney(r.totalCost),
          odometer: r.odometer != null ? `@${fmtNum(r.odometer)}${distLabel(settings)}` : ''
        });
      } else {
        rows.push({
          ...base,
          line1: [r.notes ? r.notes : 'Note'],
          cost: '',
          odometer: r.odometer != null ? `@${fmtNum(r.odometer)}${distLabel(settings)}` : ''
        });
      }
    }
  }

  rows.sort((a, b) => b.t - a.t || b.id - a.id);

  // Photo counts for the rows being shown (one query for the whole page).
  if (rows.length) {
    const photoRows = await db
      .select({ recordId: recordPhotos.recordId })
      .from(recordPhotos)
      .where(
        inArray(
          recordPhotos.recordId,
          rows.map((r) => r.id)
        )
      );
    const tally = new Map<number, number>();
    for (const p of photoRows) tally.set(p.recordId, (tally.get(p.recordId) ?? 0) + 1);
    for (const r of rows) r.photoCount = tally.get(r.id) ?? 0;
  }

  // Recorder names for the rows on shared vehicles, one lookup for the
  // whole page. A record keeps the name of whoever entered it, even
  // when that share has since been revoked.
  const sharedRows = rows.filter((r) => sharedIds.has(r.vehicleId));
  if (sharedRows.length) {
    const ids = [...new Set(sharedRows.map((r) => r.userId))];
    const people = await db
      .select({ id: users.id, username: users.username, displayName: users.displayName })
      .from(users)
      .where(inArray(users.id, ids));
    const nameById = new Map(people.map((p) => [p.id, p.displayName?.trim() ? p.displayName : p.username]));
    for (const r of sharedRows) r.recordedBy = nameById.get(r.userId) ?? '';
  }

  const totalCost = rows.reduce((a, r) => a + r.costNum, 0);
  const overallPer100 = segDist > 0 && segVol > 0 ? (segVol / segDist) * 100 : null;

  return {
    vehicleName: multi ? `${filter.vehicleIds.length} vehicles` : (nameOf.get(filter.vehicleIds[0]) ?? ''),
    singleVehicleName: nameOf.get(defaultVehicleId) ?? '',
    multi,
    rows: rows.map(({ t: _t, costNum: _c, vehicleId: _v, userId: _u, ...r }) => r),
    summary: {
      total: fmtMoney(totalCost, 0),
      avgEff: overallPer100 != null ? `${Math.round(effValue(overallPer100, settings))}${effUnitLabel(settings)}` : '-',
      count: rows.length
    },
    filtered: filter.active,
    filterHref: `/browse/filter?${filterQuery(filter)}`,
    backfillHref: `/browse/backfill?vehicle=${filter.vehicleIds.length === 1 ? filter.vehicleIds[0] : defaultVehicleId}`,
    settings
  };
};
