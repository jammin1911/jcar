import { records } from './db';
import { getAllVehicleRecords } from './computeCache';

export type RecordRow = typeof records.$inferSelect;

/**
 * All records for a vehicle, oldest first. Display queries pass the
 * viewers retention cutoff (plans.retentionCutoff) and anything older
 * is hidden by plan, never deleted. Callers that need the truth
 * (validation, previous odometer, JSON backup) leave the cutoff off
 * and get the full history.
 */
export async function getVehicleRecords(
  vehicleId: number,
  cutoff?: string | null,
  ignoreOdometer = false
): Promise<RecordRow[]> {
  // The full set comes from the version keyed cache (computeCache):
  // any write bumps the vehicles data version in its transaction,
  // so what is cached can never be older than the data it came from.
  // The retention cutoff is applied here, per viewer, on the way out.
  const all = await getAllVehicleRecords(vehicleId);
  const rows = cutoff ? all.filter((r) => r.datetime >= cutoff) : all;
  // Cost tracking vehicles have no odometer, so display queries see
  // every record as odometer-less and the odometer derived figures
  // (economy, distance, $/km) just disappear. Stored values stay put.
  return ignoreOdometer ? rows.map((r) => ({ ...r, odometer: null })) : rows;
}

export interface FuelCalc extends RecordRow {
  /** L/100km for this fuel-up vs the previous fuel-up, null when not computable */
  per100: number | null;
  /** km driven since the previous fuel-up */
  distSincePrev: number | null;
  /** days since the previous fuel-up */
  daysSincePrev: number | null;
}

export interface FuelSegment {
  /** the full fill-up record that closes the segment */
  endId: number;
  vol: number;
  dist: number;
}

interface FuelComputation {
  calcs: FuelCalc[];
  /** volume/distance summed over valid measurement segments (see below) */
  segVolume: number;
  segDistance: number;
  segments: FuelSegment[];
}

/**
 * Fuel economy from full fill-ups. Economy can only be measured
 * between full fill-ups, because that is the only time fuel added
 * equals fuel burned. So fills form segments that start at a full
 * fill (the baseline, its own volume does not count).
 *
 * A partial fill shows no figure. Its volume and distance carry
 * forward into the next full fills segment. At a full fill, per100
 * is accumulated volume since baseline over distance since baseline,
 * and the segment closes into the totals behind the overall average.
 * That average is volume weighted, total measured volume over total
 * measured distance, not the mean of the per fill figures.
 *
 * A missed fill voids its segment. Some of that distance was driven
 * on unlogged fuel, so neither the figure nor the segment totals
 * count. The missed fill itself becomes the new baseline.
 */
function computeFuel(all: RecordRow[]): FuelComputation {
  const fuels = all.filter((r) => r.type === 'fuel');
  const per100s: (number | null)[] = new Array(fuels.length).fill(null);
  let segVolumeTotal = 0;
  let segDistanceTotal = 0;
  const segments: FuelSegment[] = [];

  let baseline = -1;
  let segVol = 0;
  fuels.forEach((r, i) => {
    if (baseline < 0) {
      if (!r.partial && r.odometer != null) baseline = i;
      return;
    }
    const base = fuels[baseline];
    if (r.odometer == null || base.odometer == null) return;
    segVol += r.volume ?? 0;
    const dist = r.odometer - base.odometer;
    if (r.missed) {
      baseline = i;
      segVol = 0;
      return;
    }
    if (r.partial) return;
    if (dist > 0 && segVol > 0) {
      per100s[i] = (segVol / dist) * 100;
      segVolumeTotal += segVol;
      segDistanceTotal += dist;
      segments.push({ endId: r.id, vol: segVol, dist });
    }
    baseline = i;
    segVol = 0;
  });

  const calcs = fuels.map((r, i) => {
    const prev = i > 0 ? fuels[i - 1] : null;
    let dist: number | null = null;
    let days: number | null = null;
    if (prev && r.odometer != null && prev.odometer != null) {
      dist = r.odometer - prev.odometer;
      days = (new Date(r.datetime).getTime() - new Date(prev.datetime).getTime()) / 86400000;
    }
    return { ...r, per100: per100s[i], distSincePrev: dist, daysSincePrev: days };
  });

  return { calcs, segVolume: segVolumeTotal, segDistance: segDistanceTotal, segments };
}

export function fuelCalcs(all: RecordRow[]): FuelCalc[] {
  return computeFuel(all).calcs;
}

/** The valid measurement segments of a vehicle's history (see computeFuel). */
export function fuelSegments(all: RecordRow[]): FuelSegment[] {
  return computeFuel(all).segments;
}

export interface Summary {
  recordCount: number;
  fuelCount: number;
  serviceExpenseCount: number;
  totalRunningCost: number;
  fuelTotalCost: number;
  fuelTotalVolume: number;
  serviceExpenseTotal: number;
  /** max odometer - min odometer across all records with an odometer */
  totalDistance: number;
  firstDate: Date | null;
  lastDate: Date | null;
  spanDays: number;
  /** overall L/100km = total fuel volume / total fuel distance */
  overallPer100: number | null;
  lastOdometer: number | null;
}

export function summarize(all: RecordRow[]): Summary {
  const { calcs: fuels, segVolume, segDistance } = computeFuel(all);
  const withOdo = all.filter((r) => r.odometer != null);
  const odos = withOdo.map((r) => r.odometer as number);
  const totalDistance = odos.length >= 2 ? Math.max(...odos) - Math.min(...odos) : 0;

  const fuelVol = fuels.reduce((a, r) => a + (r.volume ?? 0), 0);

  const dates = all.map((r) => new Date(r.datetime).getTime()).filter((t) => !isNaN(t));
  const firstDate = dates.length ? new Date(Math.min(...dates)) : null;
  const lastDate = dates.length ? new Date(Math.max(...dates)) : null;
  const spanDays = firstDate && lastDate ? Math.max(1, (lastDate.getTime() - firstDate.getTime()) / 86400000) : 0;

  const se = all.filter((r) => r.type === 'service' || r.type === 'expense');
  return {
    recordCount: all.length,
    fuelCount: fuels.length,
    serviceExpenseCount: se.length,
    totalRunningCost: all.reduce((a, r) => a + (r.totalCost ?? 0), 0),
    fuelTotalCost: fuels.reduce((a, r) => a + (r.totalCost ?? 0), 0),
    fuelTotalVolume: fuelVol,
    serviceExpenseTotal: se.reduce((a, r) => a + (r.totalCost ?? 0), 0),
    totalDistance,
    firstDate,
    lastDate,
    spanDays,
    // Overall economy over valid segments only. Partials accumulate
    // into their segment and missed segments are left out entirely.
    overallPer100: segDistance > 0 && segVolume > 0 ? (segVolume / segDistance) * 100 : null,
    lastOdometer: odos.length ? Math.max(...odos) : null
  };
}
