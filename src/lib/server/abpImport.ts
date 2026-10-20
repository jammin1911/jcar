import { eq } from 'drizzle-orm';
import { db, records, vehicles, vehicleParts, locations } from './db';
import type { AbpVehicle } from './abp';

/**
 * Duplicate protection for aCar (.abp) imports. Before anything is
 * written the parsed backup gets compared against what the user
 * already has.
 *
 * A backup vehicle matches an existing one when the VIN matches (both
 * present), else the plate, else name plus year plus make, all case
 * insensitive. A record counts as already present when the matched
 * vehicle holds a record with the same type, datetime, odometer,
 * price, volume and total. That fingerprint is exact, re-importing
 * the same file reproduces identical values so this is deterministic.
 *
 * When anything matches the upload stops and the user picks: cancel,
 * merge (only the new stuff goes into the existing vehicles), or
 * import as duplicates (fresh copies of everything).
 */

export interface AbpAnalysis {
  matchedVehicles: number;
  duplicateRecords: number;
  totalRecords: number;
  /** parsed vehicle index -> existing vehicle id */
  matchByIndex: Map<number, number>;
  /** existing vehicle id -> fingerprints of what it already holds */
  existing: Map<number, { recordKeys: Set<string>; partKeys: Set<string> }>;
}

type RecShape = {
  type: string;
  datetime: string;
  odometer: number | null;
  pricePerUnit: number | null;
  volume: number | null;
  totalCost: number | null;
};

export function recordKey(r: RecShape): string {
  return [r.type, r.datetime, r.odometer ?? '', r.pricePerUnit ?? '', r.volume ?? '', r.totalCost ?? ''].join('|');
}

function partKey(p: { name: string; partNumber: string | null }): string {
  return `${p.name}|${p.partNumber ?? ''}`;
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

export async function analyzeAbpImport(userId: number, parsed: AbpVehicle[]): Promise<AbpAnalysis> {
  const mine = await db
    .select({
      id: vehicles.id,
      name: vehicles.name,
      year: vehicles.year,
      make: vehicles.make,
      licensePlate: vehicles.licensePlate,
      vin: vehicles.vin
    })
    .from(vehicles)
    .where(eq(vehicles.ownerId, userId));

  const matchByIndex = new Map<number, number>();
  parsed.forEach((v, i) => {
    const hit = mine.find(
      (m) =>
        (v.vin !== '' && m.vin !== '' && norm(v.vin) === norm(m.vin)) ||
        (v.licensePlate !== '' &&
          m.licensePlate !== '' &&
          norm(v.licensePlate) === norm(m.licensePlate)) ||
        (norm(v.name) === norm(m.name) && v.year === m.year && norm(v.make) === norm(m.make))
    );
    if (hit) matchByIndex.set(i, hit.id);
  });

  const existing = new Map<number, { recordKeys: Set<string>; partKeys: Set<string> }>();
  let duplicateRecords = 0;
  let totalRecords = 0;
  for (const [i, v] of parsed.entries()) {
    totalRecords += v.records.length;
    const existingId = matchByIndex.get(i);
    if (existingId === undefined) continue;
    if (!existing.has(existingId)) {
      const recs = await db
        .select({
          type: records.type,
          datetime: records.datetime,
          odometer: records.odometer,
          pricePerUnit: records.pricePerUnit,
          volume: records.volume,
          totalCost: records.totalCost
        })
        .from(records)
        .where(eq(records.vehicleId, existingId));
      const parts = await db
        .select({ name: vehicleParts.name, partNumber: vehicleParts.partNumber })
        .from(vehicleParts)
        .where(eq(vehicleParts.vehicleId, existingId));
      existing.set(existingId, {
        recordKeys: new Set(recs.map(recordKey)),
        partKeys: new Set(parts.map(partKey))
      });
    }
    const keys = existing.get(existingId)!.recordKeys;
    for (const r of v.records) {
      if (keys.has(recordKey(r))) duplicateRecords++;
    }
  }

  return { matchedVehicles: matchByIndex.size, duplicateRecords, totalRecords, matchByIndex, existing };
}

export interface AbpImportResult {
  fuel: number;
  services: number;
  expenses: number;
  parts: number;
  newVehicles: number;
  skippedRecords: number;
  skippedParts: number;
  latestVehicleId: number | null;
}

/**
 * Runs the import. Fresh mode inserts everything as new vehicles.
 * Merge mode puts matched vehicles new records and parts into the
 * existing vehicles, skipping fingerprints that are already there,
 * and creates the rest as new.
 */
export async function executeAbpImport(
  userId: number,
  parsed: AbpVehicle[],
  mode: 'fresh' | 'merge',
  analysis: AbpAnalysis | null
): Promise<AbpImportResult> {
  const now = new Date().toISOString();
  const out: AbpImportResult = {
    fuel: 0,
    services: 0,
    expenses: 0,
    parts: 0,
    newVehicles: 0,
    skippedRecords: 0,
    skippedParts: 0,
    latestVehicleId: null
  };
  let latestDt = '';

  await db.transaction(async (tx) => {
    // Locations from record places, deduped by street+city. In merge
    // mode the user's existing locations are reused first.
    const locIds = new Map<string, number>();
    if (mode === 'merge') {
      const mineLocs = await tx
        .select({ id: locations.id, street: locations.street, city: locations.city })
        .from(locations)
        .where(eq(locations.userId, userId));
      for (const l of mineLocs) locIds.set(`${l.street}|${l.city}`, l.id);
    }
    const locIdFor = async (place: {
      street: string;
      city: string;
      province: string;
      postalCode: string;
      country: string;
    }): Promise<number | null> => {
      const key = `${place.street}|${place.city}`;
      const existingLoc = locIds.get(key);
      if (existingLoc) return existingLoc;
      const [row] = await tx
        .insert(locations)
        .values({ userId, ...place, notes: '' })
        .returning({ id: locations.id });
      locIds.set(key, row.id);
      return row.id;
    };

    for (const [i, v] of parsed.entries()) {
      const matchedId = mode === 'merge' ? analysis?.matchByIndex.get(i) : undefined;
      let vid: number;
      if (matchedId !== undefined) {
        vid = matchedId;
        // Fill purchase/sale details only where the existing vehicle
        // has none - a merge never overwrites what is already there.
        const [cur] = await tx
          .select({
            purchasedOdometer: vehicles.purchasedOdometer,
            soldOdometer: vehicles.soldOdometer
          })
          .from(vehicles)
          .where(eq(vehicles.id, vid));
        const fill: Record<string, unknown> = {};
        if (cur && cur.purchasedOdometer === null && v.purchased) {
          fill.purchasedOdometer = v.purchased.odometer ?? null;
          fill.purchasedPrice = v.purchased.price ?? null;
          fill.purchasedDate = v.purchased.date ?? '';
          fill.purchasedNotes = v.purchased.notes ?? '';
        }
        if (cur && cur.soldOdometer === null && v.sold) {
          fill.soldOdometer = v.sold.odometer ?? null;
          fill.soldPrice = v.sold.price ?? null;
          fill.soldDate = v.sold.date ?? '';
          fill.soldNotes = v.sold.notes ?? '';
        }
        if (Object.keys(fill).length) {
          await tx.update(vehicles).set(fill).where(eq(vehicles.id, vid));
        }
      } else {
        const [veh] = await tx
          .insert(vehicles)
          .values({
            ownerId: userId,
            name: v.name,
            year: v.year,
            make: v.make,
            model: v.model,
            submodel: v.submodel,
            engine: v.engine,
            transmission: v.transmission,
            driveType: v.driveType,
            bodyType: v.bodyType,
            distanceUnit: v.distanceUnit,
            volumeUnit: v.volumeUnit,
            licensePlate: v.licensePlate,
            vin: v.vin,
            tankCapacity: v.tankCapacity,
            notes: v.notes,
            purchasedOdometer: v.purchased?.odometer ?? null,
            purchasedPrice: v.purchased?.price ?? null,
            purchasedDate: v.purchased?.date ?? '',
            purchasedNotes: v.purchased?.notes ?? '',
            soldOdometer: v.sold?.odometer ?? null,
            soldPrice: v.sold?.price ?? null,
            soldDate: v.sold?.date ?? '',
            soldNotes: v.sold?.notes ?? '',
            active: v.active ? 1 : 0,
            costTracking: 0,
            createdAt: now
          })
          .returning({ id: vehicles.id });
        vid = veh.id;
        out.newVehicles++;
      }

      const held = matchedId !== undefined ? analysis!.existing.get(matchedId) : undefined;
      for (const p of v.parts) {
        if (held) {
          const k = partKey(p);
          if (held.partKeys.has(k)) {
            out.skippedParts++;
            continue;
          }
          held.partKeys.add(k);
        }
        await tx.insert(vehicleParts).values({ vehicleId: vid, ...p });
        out.parts++;
      }
      for (const r of v.records) {
        if (held) {
          const k = recordKey(r);
          if (held.recordKeys.has(k)) {
            out.skippedRecords++;
            continue;
          }
          held.recordKeys.add(k);
        }
        await tx.insert(records).values({
          vehicleId: vid,
          userId,
          type: r.type,
          title: r.title,
          datetime: r.datetime,
          odometer: r.odometer,
          pricePerUnit: r.pricePerUnit,
          volume: r.volume,
          totalCost: r.totalCost,
          partial: r.partial ? 1 : 0,
          missed: r.missed ? 1 : 0,
          notes: r.notes,
          locationId: r.place ? await locIdFor(r.place) : null,
          createdAt: now
        });
        if (r.type === 'fuel') out.fuel++;
        else if (r.type === 'service') out.services++;
        else out.expenses++;
        if (r.datetime > latestDt) {
          latestDt = r.datetime;
          out.latestVehicleId = vid;
        }
      }
    }
  });

  return out;
}
