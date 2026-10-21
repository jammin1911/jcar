import { asc, eq, inArray } from 'drizzle-orm';
import { db, records, vehicles } from './db';

type RecordRow = typeof records.$inferSelect;

// A vehicles full record set, cached in memory under its data
// version (src/lib/server/versions.ts). Every write bumps the
// version in the same transaction as the write, so the moment any
// record changes, every cached set for that vehicle is unreachable:
// the next read sees the new version, misses, and recomputes. The
// version is read before the rows on a miss, which is what makes the
// pairing airtight, an entry can only ever hold rows at least as new
// as the version it is stored under.
//
// Callers get copies, never the cached rows themselves, so sorting
// or annotating a result cannot corrupt what the next request sees.

const MAX_VEHICLES = 64;
const cache = new Map<number, { version: number; rows: RecordRow[] }>();

/** The vehicles current data version, or null when it does not exist. */
export async function vehicleVersion(vehicleId: number): Promise<number | null> {
  const rows = await db
    .select({ v: vehicles.dataVersion })
    .from(vehicles)
    .where(eq(vehicles.id, vehicleId))
    .limit(1);
  return rows[0]?.v ?? null;
}

/** Current data versions for several vehicles, one query. */
export async function vehicleVersions(ids: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (!ids.length) return out;
  const rows = await db
    .select({ id: vehicles.id, v: vehicles.dataVersion })
    .from(vehicles)
    .where(inArray(vehicles.id, ids));
  for (const r of rows) out.set(r.id, r.v);
  return out;
}

/** All records for a vehicle, oldest first, from the version cache. */
export async function getAllVehicleRecords(vehicleId: number): Promise<RecordRow[]> {
  const version = await vehicleVersion(vehicleId);
  if (version !== null) {
    const hit = cache.get(vehicleId);
    if (hit && hit.version === version) return hit.rows.map((r) => ({ ...r }));
  }
  const rows = await db
    .select()
    .from(records)
    .where(eq(records.vehicleId, vehicleId))
    .orderBy(asc(records.datetime), asc(records.id));
  if (version !== null) {
    cache.delete(vehicleId);
    cache.set(vehicleId, { version, rows });
    while (cache.size > MAX_VEHICLES) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  }
  return rows.map((r) => ({ ...r }));
}
