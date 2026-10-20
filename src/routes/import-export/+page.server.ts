import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getSelectedVehicle, getSettings } from '$lib/server/vehicles';
import { fmtDateTime } from '$lib/format';
import { vehicleLimitBlock } from '$lib/server/plans';
import { analyzeAbpImport, executeAbpImport, type AbpImportResult } from '$lib/server/abpImport';
import {
  scanJcarBackup,
  scanAbp,
  scanFuelio,
  scanFuelly,
  scanGeneric,
  scanSimplyAuto,
  scanDrivvo,
  scanSpritmonitor,
  scanMotostat,
  scanFuelLog,
  executeNormalizedImport,
  executeJcarBackup,
  type ImportKind,
  type ScanResult
} from '$lib/server/importFormats';
import { createScanJob, getScanJob, deleteScanJob } from '$lib/server/scanJobs';

export const load: PageServerLoad = async ({ locals, cookies, url }) => {
  const access = await getSelectedVehicle(cookies, locals.user!.id);
  return {
    vehicleName: access?.vehicle.name ?? null,
    vehicleId: access?.vehicle.id ?? null,
    upgrade: url.searchParams.get('upgrade') === '1'
  };
};

const KIND_LABELS: Record<ImportKind, string> = {
  jcar: 'jCar Backup',
  abp: 'aCar Backup',
  fuelio: 'Fuelio Backup',
  fuelly: 'Fuelly CSV',
  simplyauto: 'Simply Auto',
  drivvo: 'Drivvo',
  spritmonitor: 'Spritmonitor',
  generic: 'Generic CSV',
  motostat: 'Motostat',
  fuellog: 'Fuel Log'
};

/** Kinds whose records land in the dashboard-selected vehicle (the file carries no usable vehicle identity). */
const SELECTED_KINDS: ImportKind[] = ['fuelly', 'generic', 'simplyauto', 'spritmonitor', 'motostat'];

function freshAbpMessage(vehicleCount: number, r: AbpImportResult, skipped: number): string {
  const bits = [
    `${r.fuel} fuel-up${r.fuel === 1 ? '' : 's'}`,
    `${r.services} service${r.services === 1 ? '' : 's'}`,
    `${r.expenses} expense${r.expenses === 1 ? '' : 's'}`
  ];
  if (r.parts) bits.push(`${r.parts} part${r.parts === 1 ? '' : 's'}`);
  return `Imported ${vehicleCount} vehicle${vehicleCount === 1 ? '' : 's'} from your aCar backup: ${bits.join(', ')}${skipped ? ` (${skipped} items skipped)` : ''}`;
}

function mergeAbpMessage(r: AbpImportResult): string {
  const added = r.fuel + r.services + r.expenses;
  const bits = [`added ${added} new record${added === 1 ? '' : 's'}`];
  if (r.parts) bits.push(`${r.parts} new part${r.parts === 1 ? '' : 's'}`);
  if (r.newVehicles) bits.push(`${r.newVehicles} new vehicle${r.newVehicles === 1 ? '' : 's'}`);
  const skippedBits = [`${r.skippedRecords} record${r.skippedRecords === 1 ? '' : 's'}`];
  if (r.skippedParts) skippedBits.push(`${r.skippedParts} part${r.skippedParts === 1 ? '' : 's'}`);
  return `Merged your aCar backup: ${bits.join(', ')}; skipped ${skippedBits.join(' and ')} that were already in your account.`;
}

function doneMessage(scan: ScanResult, vehicleCount: number, recordCount: number): string {
  const counts = scan.counts;
  const bits: string[] = [];
  if (counts.fuel) bits.push(`${counts.fuel} fuel-up${counts.fuel === 1 ? '' : 's'}`);
  if (counts.service) bits.push(`${counts.service} service${counts.service === 1 ? '' : 's'}`);
  if (counts.expense) bits.push(`${counts.expense} expense${counts.expense === 1 ? '' : 's'}`);
  if (counts.note) bits.push(`${counts.note} note${counts.note === 1 ? '' : 's'}`);
  if (scan.target === 'selected') {
    return `Imported ${bits.join(', ')} into ${scan.targetVehicleName} from your ${scan.kindLabel} file.`;
  }
  return `Imported ${vehicleCount} vehicle${vehicleCount === 1 ? '' : 's'} (${bits.join(', ')}) from your ${scan.kindLabel} file.`;
}

export const actions: Actions = {
  /**
   * Step 1 of every import: parse and validate the uploaded file,
   * then return a summary for the user to confirm. Nothing is
   * written, the parsed data is stashed server-side for 10 minutes.
   */
  scan: async ({ request, locals, cookies }) => {
    const user = locals.user!;
    const data = await request.formData();
    const kind = String(data.get('kind') ?? '') as ImportKind;
    const file = data.get('file');
    if (!KIND_LABELS[kind]) return fail(400, { scanError: 'Unknown import type.' });
    if (!(file instanceof File) || file.size === 0) {
      return fail(400, { scanError: `Choose a ${KIND_LABELS[kind]} file first.` });
    }
    if (file.size > 25 * 1024 * 1024) {
      return fail(400, { scanError: 'That file is too large (max 25 MB).' });
    }

    let access: Awaited<ReturnType<typeof getSelectedVehicle>> = null;
    if (SELECTED_KINDS.includes(kind)) {
      access = await getSelectedVehicle(cookies, user.id);
      if (!access) {
        return fail(400, {
          scanError: `${KIND_LABELS[kind]} records are added to your selected vehicle - add or select a vehicle first.`
        });
      }
    }

    let scan: ScanResult;
    try {
      const text = kind === 'abp' ? '' : await file.text();
      const bytes = kind === 'abp' ? Buffer.from(await file.arrayBuffer()) : Buffer.alloc(0);
      switch (kind) {
        case 'jcar':
          scan = scanJcarBackup(text, file.name);
          break;
        case 'abp':
          scan = scanAbp(bytes, file.name);
          break;
        case 'fuelio':
          scan = scanFuelio(text, file.name);
          break;
        case 'drivvo':
          scan = scanDrivvo(text, file.name);
          break;
        case 'fuellog':
          scan = scanFuelLog(text, file.name);
          break;
        case 'fuelly':
          scan = scanFuelly(text, file.name, { id: access!.vehicle.id, name: access!.vehicle.name });
          break;
        case 'generic':
          scan = scanGeneric(text, file.name, {
            id: access!.vehicle.id,
            name: access!.vehicle.name,
            volumeUnit: access!.vehicle.volumeUnit ?? 'Liters'
          });
          break;
        case 'simplyauto':
          scan = scanSimplyAuto(text, file.name, {
            id: access!.vehicle.id,
            name: access!.vehicle.name,
            volumeUnit: access!.vehicle.volumeUnit ?? 'Liters',
            distanceUnit: access!.vehicle.distanceUnit ?? 'Kilometers'
          });
          break;
        case 'spritmonitor':
          scan = scanSpritmonitor(text, file.name, { id: access!.vehicle.id, name: access!.vehicle.name });
          break;
        case 'motostat':
          scan = scanMotostat(text, file.name, { id: access!.vehicle.id, name: access!.vehicle.name });
          break;
      }
    } catch (e) {
      return fail(400, {
        scanError: e instanceof Error ? e.message : 'Could not read that file.'
      });
    }

    // aCar duplicate protection rides along with the scan, the
    // summary shows any overlaps and offers merge or import anyway.
    let abpMatched = 0;
    let abpDuplicates = 0;
    let abpAnalysis: Awaited<ReturnType<typeof analyzeAbpImport>> | null = null;
    if (kind === 'abp' && scan.abpVehicles) {
      abpAnalysis = await analyzeAbpImport(user.id, scan.abpVehicles);
      abpMatched = abpAnalysis.matchedVehicles;
      abpDuplicates = abpAnalysis.duplicateRecords;
    }

    let limitWarning: string | null = null;
    if (scan.target === 'new') {
      const newVehicles =
        kind === 'abp' && abpAnalysis ? scan.vehicles.length - abpAnalysis.matchedVehicles : scan.vehicles.length;
      const block = await vehicleLimitBlock(user.id, Math.max(0, newVehicles));
      if (block) {
        limitWarning = `Your plan allows up to ${block.limit} vehicles (you have ${block.owned}) - this file would add ${newVehicles} more, so Import will be refused unless vehicles are removed.`;
      }
    }

    const token = createScanJob(user.id, scan);
    const settings = await getSettings(user.id);
    return {
      scan: {
        token,
        kindLabel: scan.kindLabel,
        fileName: scan.fileName,
        totalRecords: scan.totalRecords,
        counts: scan.counts,
        vehicleNames: scan.vehicles.map((v) => v.name),
        targetName: scan.target === 'selected' ? scan.targetVehicleName : null,
        mostRecent: scan.mostRecent ? fmtDateTime(scan.mostRecent, settings) : null,
        skippedRows: scan.skippedRows,
        note: scan.note,
        limitWarning,
        abpMatched,
        abpDuplicates
      }
    };
  },

  /** Step 2: the user pressed Import Now (or a merge choice for .abp). */
  execute: async ({ request, locals, cookies }) => {
    const user = locals.user!;
    const data = await request.formData();
    const token = String(data.get('token') ?? '');
    const mode = String(data.get('mode') ?? 'fresh');
    const job = getScanJob(token, user.id);
    if (!job) {
      return fail(400, { scanError: 'That import has expired - please choose the file again.' });
    }
    const scan = job.scan;
    deleteScanJob(token);

    if (scan.kind === 'abp') {
      const vehicles = scan.abpVehicles!;
      const analysis = await analyzeAbpImport(user.id, vehicles);
      if (mode === 'merge') {
        const newOnes = vehicles.length - analysis.matchedVehicles;
        const block = await vehicleLimitBlock(user.id, newOnes);
        if (block) {
          return fail(400, {
            scanError: `Your plan allows up to ${block.limit} vehicles (you have ${block.owned}) - merging this backup would add ${newOnes} new ones.`
          });
        }
        const r = await executeAbpImport(user.id, vehicles, 'merge', analysis);
        if (r.latestVehicleId !== null) {
          cookies.set('jcar_vehicle', String(r.latestVehicleId), { path: '/', maxAge: 60 * 60 * 24 * 365 });
        }
        return { done: mergeAbpMessage(r) };
      }
      const block = await vehicleLimitBlock(user.id, vehicles.length);
      if (block) {
        return fail(400, {
          scanError: `Your plan allows up to ${block.limit} vehicles (you have ${block.owned}) - this backup would add ${vehicles.length} more.`
        });
      }
      const r = await executeAbpImport(user.id, vehicles, 'fresh', null);
      if (r.latestVehicleId !== null) {
        cookies.set('jcar_vehicle', String(r.latestVehicleId), { path: '/', maxAge: 60 * 60 * 24 * 365 });
      }
      return { done: freshAbpMessage(vehicles.length, r, scan.abpSkipped ?? 0) };
    }

    if (scan.target === 'new') {
      const block = await vehicleLimitBlock(user.id, scan.vehicles.length);
      if (block) {
        return fail(400, {
          scanError: `Your plan allows up to ${block.limit} vehicles (you have ${block.owned}) - this file would add ${scan.vehicles.length} more.`
        });
      }
    }

    const result =
      scan.kind === 'jcar'
        ? await executeJcarBackup(user.id, scan.jcarParsed)
        : await executeNormalizedImport(user.id, scan);
    if (result.firstVehicleId !== null && scan.target === 'new') {
      cookies.set('jcar_vehicle', String(result.firstVehicleId), { path: '/', maxAge: 60 * 60 * 24 * 365 });
    }
    return { done: doneMessage(scan, result.vehicleCount, result.recordCount) };
  },

  cancelImport: async ({ request, locals }) => {
    const user = locals.user!;
    const data = await request.formData();
    const token = String(data.get('token') ?? '');
    if (getScanJob(token, user.id)) deleteScanJob(token);
    return { done: 'Import cancelled - nothing was changed.' };
  }
};
