import { parseCsv } from './csv';
import { parseAbp, type AbpVehicle } from './abp';

/**
 * Import format support. Every importer has the same shape, a scan
 * function validates the file and normalizes it into ScanVehicle and
 * ScanRecord data without writing anything, the user confirms the
 * summary, and only then does an executor insert rows. A scan that
 * can't make sense of the file throws an error with a user readable
 * message, so a wrong format file gets refused up front instead of
 * importing garbage.
 *
 * Canonical units everywhere, odometers in km, volumes in litres,
 * prices in $/litre.
 */

export type ImportKind =
  | 'jcar'
  | 'abp'
  | 'fuelio'
  | 'fuelly'
  | 'simplyauto'
  | 'drivvo'
  | 'spritmonitor'
  | 'generic'
  | 'motostat'
  | 'fuellog';

export interface ScanRecord {
  type: 'fuel' | 'service' | 'expense' | 'note';
  title: string;
  datetime: string; // ISO local "YYYY-MM-DDTHH:MM:00"
  odometer: number | null;
  pricePerUnit: number | null;
  volume: number | null;
  totalCost: number | null;
  partial: boolean;
  missed: boolean;
  notes: string;
}

export interface ScanVehicle {
  name: string;
  year: string;
  make: string;
  model: string;
  vin: string;
  licensePlate: string;
  distanceUnit: 'Kilometers' | 'Miles';
  volumeUnit: 'Liters' | 'Gallons';
  records: ScanRecord[];
}

export interface ScanResult {
  kind: ImportKind;
  kindLabel: string;
  fileName: string;
  /** 'new' when the file carries its own vehicles, 'selected' when
   *  records go into the dashboard selected vehicle */
  target: 'new' | 'selected';
  targetVehicleId: number | null;
  targetVehicleName: string | null;
  vehicles: ScanVehicle[];
  totalRecords: number;
  counts: { fuel: number; service: number; expense: number; note: number };
  mostRecent: string | null; // ISO datetime of the newest record
  skippedRows: number;
  /** visible assumptions the user should see before confirming (units etc.) */
  note: string | null;
  /** passthrough payloads for the special executors */
  jcarParsed?: unknown;
  abpVehicles?: AbpVehicle[];
  abpSkipped?: number;
}

const GAL_US = 3.78541;
const GAL_UK = 4.54609;
const MI_KM = 1.60934;

function num(v: string | number | null | undefined, decimalComma = false): number | null {
  if (v === null || v === undefined) return null;
  let s = String(v).replace(/[$£€\s]/g, '');
  if (decimalComma) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  if (s === '' || s === '-') return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Build a naive local ISO datetime from parts. Date only values land
 *  at midday to dodge timezone date flips. */
function isoLocal(y: number, mo: number, d: number, h = 12, mi = 0): string | null {
  if (!(y > 1900 && y < 2200 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return null;
  return `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:00`;
}

function summarize(
  base: Omit<ScanResult, 'totalRecords' | 'counts' | 'mostRecent'>
): ScanResult {
  const counts = { fuel: 0, service: 0, expense: 0, note: 0 };
  let total = 0;
  let most: string | null = null;
  for (const v of base.vehicles) {
    for (const r of v.records) {
      counts[r.type]++;
      total++;
      if (!most || r.datetime > most) most = r.datetime;
    }
  }
  return { ...base, totalRecords: total, counts, mostRecent: most };
}

function rec(p: Partial<ScanRecord> & { datetime: string }): ScanRecord {
  return {
    type: 'fuel',
    title: '',
    odometer: null,
    pricePerUnit: null,
    volume: null,
    totalCost: null,
    partial: false,
    missed: false,
    notes: '',
    ...p
  };
}

function blankVehicle(name: string): ScanVehicle {
  return {
    name,
    year: '',
    make: '',
    model: '',
    vin: '',
    licensePlate: '',
    distanceUnit: 'Kilometers',
    volumeUnit: 'Liters',
    records: []
  };
}

/** Split a sectioned text file (Fuelio/Drivvo/Fuel Log style) into [marker, body] pairs. */
function splitSections(text: string): { marker: string; body: string }[] {
  const out: { marker: string; body: string }[] = [];
  let cur: { marker: string; lines: string[] } | null = null;
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const m = line.match(/^"#+\s*([^"]*)"\s*$/) || line.match(/^#+\s*(.*?)\s*$/);
    if (m && /^(##?\s*)?[A-Za-z]/.test(line.replace(/"/g, ''))) {
      if (cur) out.push({ marker: cur.marker, body: cur.lines.join('\n') });
      cur = { marker: m[1].trim().toLowerCase(), lines: [] };
    } else if (cur) {
      cur.lines.push(line);
    }
  }
  if (cur) out.push({ marker: cur.marker, body: cur.lines.join('\n') });
  return out;
}

/** Parse one section body: first non-empty row is the header. */
function sectionRows(body: string, delimiter = ','): { headers: string[]; rows: string[][] } {
  const rows = parseCsv(body, delimiter).filter((r) => r.some((c) => c.trim() !== ''));
  if (rows.length === 0) return { headers: [], rows: [] };
  return { headers: rows[0].map((h) => h.trim()), rows: rows.slice(1) };
}

function colIdx(headers: string[], test: (h: string) => boolean): number {
  return headers.findIndex((h) => test(h.trim().toLowerCase()));
}

// jCar backup (JSON)

export function scanJcarBackup(text: string, fileName: string): ScanResult {
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not a valid jCar backup (it is not JSON).');
  }
  if (!parsed || parsed.app !== 'jcar' || !Array.isArray(parsed.vehicles)) {
    throw new Error('That file is not a jCar backup.');
  }
  const vehicles: ScanVehicle[] = parsed.vehicles.map((v: any) => {
    const sv = blankVehicle(String(v.name ?? 'Vehicle'));
    sv.year = String(v.year ?? '');
    sv.make = String(v.make ?? '');
    sv.model = String(v.model ?? '');
    sv.vin = String(v.vin ?? '');
    sv.licensePlate = String(v.licensePlate ?? '');
    sv.records = (Array.isArray(v.records) ? v.records : []).map((r: any) =>
      rec({
        type: ['fuel', 'service', 'expense', 'note'].includes(r.type) ? r.type : 'fuel',
        title: String(r.title ?? ''),
        datetime: String(r.datetime ?? ''),
        odometer: r.odometer ?? null,
        pricePerUnit: r.pricePerUnit ?? null,
        volume: r.volume ?? null,
        totalCost: r.totalCost ?? null,
        partial: !!r.partial,
        missed: !!r.missed,
        notes: String(r.notes ?? '')
      })
    );
    return sv;
  });
  return summarize({
    kind: 'jcar',
    kindLabel: 'jCar Backup',
    fileName,
    target: 'new',
    targetVehicleId: null,
    targetVehicleName: null,
    vehicles,
    skippedRows: 0,
    note: null,
    jcarParsed: parsed
  });
}

// aCar backup (.abp), adapter over the existing parser

export function scanAbp(bytes: Buffer, fileName: string): ScanResult {
  const parsed = parseAbp(bytes); // throws with a readable message
  const vehicles: ScanVehicle[] = parsed.vehicles.map((v) => {
    const sv = blankVehicle(v.name);
    sv.year = v.year;
    sv.make = v.make;
    sv.model = v.model;
    sv.vin = v.vin;
    sv.licensePlate = v.licensePlate;
    sv.distanceUnit = v.distanceUnit;
    sv.volumeUnit = v.volumeUnit;
    sv.records = v.records.map((r) =>
      rec({
        type: r.type,
        title: r.title,
        datetime: r.datetime,
        odometer: r.odometer,
        pricePerUnit: r.pricePerUnit,
        volume: r.volume,
        totalCost: r.totalCost,
        partial: r.partial,
        missed: r.missed,
        notes: r.notes
      })
    );
    return sv;
  });
  return summarize({
    kind: 'abp',
    kindLabel: 'aCar Backup',
    fileName,
    target: 'new',
    targetVehicleId: null,
    targetVehicleName: null,
    vehicles,
    skippedRows: parsed.skipped,
    note: null,
    abpVehicles: parsed.vehicles,
    abpSkipped: parsed.skipped
  });
}

// Fuelio backup CSV. Layout checked against a real sample backup and
// two open source parsers. Sections are marked with lines like
// "## Vehicle" and each section has its own header row. Unit codes:
// DistUnit 0=km, 1=mi. FuelUnit 0=litres, 1=US gal, 2=UK gal. Log
// headers also carry units in their names ("Odo (mi)",
// "Fuel (litres)") and header hints win when present.

const FUELIO_SERVICE_CATS =
  /service|maintenance|repair|oil|mot\b|inspection|tire|tyre|brake|battery|filter|alignment|spark/i;

export function scanFuelio(text: string, fileName: string): ScanResult {
  const sections = splitSections(text);
  const vehSec = sections.find((s) => s.marker === 'vehicle');
  const logSec = sections.find((s) => s.marker === 'log');
  if (!vehSec || !logSec) {
    throw new Error('That does not look like a Fuelio backup (no ## Vehicle / ## Log sections).');
  }
  const vrows = sectionRows(vehSec.body);
  const v = vrows.rows[0] ?? [];
  const vget = (name: string): string => {
    const i = vrows.headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());
    return i >= 0 ? String(v[i] ?? '').trim() : '';
  };
  const vehicle = blankVehicle(vget('Name') || fileName.replace(/\.csv$/i, ''));
  vehicle.make = vget('Make');
  vehicle.model = vget('Model');
  vehicle.year = vget('Year');
  vehicle.vin = vget('VIN');
  vehicle.licensePlate = vget('Plate');
  const distUnitCode = num(vget('DistUnit'));
  const fuelUnitCode = num(vget('FuelUnit'));
  vehicle.distanceUnit = distUnitCode === 1 ? 'Miles' : 'Kilometers';
  vehicle.volumeUnit = fuelUnitCode === 0 ? 'Liters' : 'Gallons';

  // Categories for the Costs section (CostTypeID -> Name)
  const catNames = new Map<string, string>();
  const catSec = sections.find((s) => s.marker === 'costcategories');
  if (catSec) {
    const { headers, rows } = sectionRows(catSec.body);
    const idI = colIdx(headers, (h) => h === 'costtypeid');
    const nameI = colIdx(headers, (h) => h === 'name');
    for (const r of rows) {
      if (idI >= 0 && nameI >= 0) catNames.set(String(r[idI]).trim(), String(r[nameI] ?? '').trim());
    }
  }

  let skipped = 0;
  // Fuel log
  const log = sectionRows(logSec.body);
  const h = log.headers.map((x) => x.toLowerCase());
  const iData = h.findIndex((x) => x === 'data' || x === 'date');
  const iOdo = h.findIndex((x) => x.startsWith('odo'));
  const iFuel = h.findIndex((x) => x.startsWith('fuel') && !x.includes('type'));
  const iFull = h.findIndex((x) => x === 'full');
  const iPrice = h.findIndex((x) => x.startsWith('price'));
  const iNotes = h.findIndex((x) => x.startsWith('notes'));
  const iCity = h.findIndex((x) => x.startsWith('city'));
  const iMissed = h.findIndex((x) => x === 'missed');
  const iVolPrice = h.findIndex((x) => x === 'volumeprice');
  if (iData < 0 || iOdo < 0 || iFuel < 0) {
    throw new Error('The Fuelio log section is missing its date/odometer/fuel columns.');
  }
  const odoInMiles = /\(mi\)/.test(h[iOdo]) || (!/\(km\)/.test(h[iOdo]) && distUnitCode === 1);
  const fuelInGalUS = /gallons/.test(h[iFuel]) && fuelUnitCode === 1;
  const fuelInGalUK = /gallons/.test(h[iFuel]) && fuelUnitCode === 2;
  const odoFactor = odoInMiles ? MI_KM : 1;
  const volFactor = fuelInGalUS ? GAL_US : fuelInGalUK ? GAL_UK : 1;
  for (const r of log.rows) {
    const dm = String(r[iData] ?? '').match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
    if (!dm) {
      skipped++;
      continue;
    }
    const dt = isoLocal(+dm[1], +dm[2], +dm[3], dm[4] ? +dm[4] : 12, dm[5] ? +dm[5] : 0);
    if (!dt) {
      skipped++;
      continue;
    }
    const volumeRaw = num(r[iFuel]);
    const volume = volumeRaw === null ? null : volumeRaw * volFactor;
    const odoRaw = num(r[iOdo]);
    let total = iPrice >= 0 ? num(r[iPrice]) : null;
    let price = iVolPrice >= 0 ? num(r[iVolPrice]) : null;
    if (price !== null && volFactor !== 1) price = price / volFactor;
    if (total === null && price !== null && volume !== null) total = price * volume;
    if (price === null && total !== null && volume !== null && volume > 0) price = total / volume;
    let notes = iNotes >= 0 ? String(r[iNotes] ?? '').trim() : '';
    const city = iCity >= 0 ? String(r[iCity] ?? '').trim() : '';
    if (city) notes = notes ? `${notes} (${city})` : city;
    vehicle.records.push(
      rec({
        datetime: dt,
        odometer: odoRaw === null ? null : odoRaw * odoFactor,
        volume,
        totalCost: total,
        pricePerUnit: price,
        partial: iFull >= 0 ? String(r[iFull]).trim() !== '1' : false,
        missed: iMissed >= 0 ? String(r[iMissed]).trim() === '1' : false,
        notes
      })
    );
  }

  // Costs -> service/expense records, typed by category-name heuristic
  const costSec = sections.find((s) => s.marker === 'costs');
  if (costSec) {
    const { headers, rows } = sectionRows(costSec.body);
    const hh = headers.map((x) => x.toLowerCase());
    const iTitle = hh.findIndex((x) => x === 'costtitle');
    const iDate = hh.findIndex((x) => x === 'date');
    const iOdo = hh.findIndex((x) => x === 'odo');
    const iType = hh.findIndex((x) => x === 'costtypeid');
    const iNotes = hh.findIndex((x) => x === 'notes');
    const iCost = hh.findIndex((x) => x === 'cost');
    const iIncome = hh.findIndex((x) => x === 'isincome');
    for (const r of rows) {
      if (iIncome >= 0 && String(r[iIncome]).trim() === '1') {
        skipped++;
        continue;
      }
      const dm = String(r[iDate] ?? '').match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
      const dt = dm ? isoLocal(+dm[1], +dm[2], +dm[3], dm[4] ? +dm[4] : 12, dm[5] ? +dm[5] : 0) : null;
      if (!dt) {
        skipped++;
        continue;
      }
      const catName = iType >= 0 ? (catNames.get(String(r[iType]).trim()) ?? '') : '';
      const title = (iTitle >= 0 ? String(r[iTitle] ?? '').trim() : '') || catName;
      const odoRaw = iOdo >= 0 ? num(r[iOdo]) : null;
      vehicle.records.push(
        rec({
          type: FUELIO_SERVICE_CATS.test(catName) || FUELIO_SERVICE_CATS.test(title) ? 'service' : 'expense',
          title,
          datetime: dt,
          odometer: odoRaw === null || odoRaw === 0 ? null : odoRaw * odoFactor,
          totalCost: iCost >= 0 ? num(r[iCost]) : null,
          notes: iNotes >= 0 ? String(r[iNotes] ?? '').trim() : ''
        })
      );
    }
  }

  if (vehicle.records.length === 0) throw new Error('No records found in that Fuelio backup.');
  vehicle.records.sort((a, b) => (a.datetime < b.datetime ? -1 : 1));
  return summarize({
    kind: 'fuelio',
    kindLabel: 'Fuelio Backup',
    fileName,
    target: 'new',
    targetVehicleId: null,
    targetVehicleName: null,
    vehicles: [vehicle],
    skippedRows: skipped,
    note: 'Costs are filed as Service when their Fuelio category looks like maintenance work, and as Expense otherwise.'
  });
}

// Fuelly CSV

export function scanFuelly(
  text: string,
  fileName: string,
  target: { id: number; name: string }
): ScanResult {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('No data rows found in that file.');
  const headers = rows[0];
  const find = (test: (h: string) => boolean) => colIdx(headers, test);
  const dateCol = find((h) => h.includes('date'));
  const odoCol = find((h) => h.includes('odometer'));
  const galCol = find((h) => h.includes('gallon'));
  const litCol = find((h) => h.includes('litre') || h.includes('liter') || h === 'volume');
  const volCol = litCol >= 0 ? litCol : galCol;
  const volFactor = litCol >= 0 ? 1 : GAL_US;
  const priceCol = find((h) => h.includes('price'));
  const totalCol = find((h) => h.includes('total') || h === 'cost' || h.includes('amount'));
  const notesCol = find((h) => h.includes('note'));
  const partialCol = find((h) => h.includes('partial'));
  if (dateCol < 0) throw new Error('Could not find a Date column in that CSV.');

  const vehicle = blankVehicle(target.name);
  let skipped = 0;
  for (const row of rows.slice(1)) {
    const date = new Date(row[dateCol]);
    if (isNaN(date.getTime())) {
      skipped++;
      continue;
    }
    let volume = volCol >= 0 ? num(row[volCol]) : null;
    if (volume !== null) volume = volume * volFactor;
    let price = priceCol >= 0 ? num(row[priceCol]) : null;
    if (price !== null && volFactor !== 1) price = price / volFactor;
    let total = totalCol >= 0 ? num(row[totalCol]) : null;
    if (total === null && price !== null && volume !== null) total = price * volume;
    if (price === null && total !== null && volume !== null && volume > 0) price = total / volume;
    const partialRaw = partialCol >= 0 ? String(row[partialCol] ?? '').toLowerCase() : '';
    vehicle.records.push(
      rec({
        datetime: date.toISOString(),
        odometer: odoCol >= 0 ? num(row[odoCol]) : null,
        pricePerUnit: price,
        volume,
        totalCost: total,
        partial: partialRaw === 'yes' || partialRaw === 'true' || partialRaw === '1',
        notes: notesCol >= 0 ? String(row[notesCol] ?? '').trim() : ''
      })
    );
  }
  if (vehicle.records.length === 0) throw new Error('No importable fuel-up rows found in that CSV.');
  return summarize({
    kind: 'fuelly',
    kindLabel: 'Fuelly CSV',
    fileName,
    target: 'selected',
    targetVehicleId: target.id,
    targetVehicleName: target.name,
    vehicles: [vehicle],
    skippedRows: skipped,
    note: null
  });
}

// Generic CSV, a LubeLogger style header alias mapper. Header names
// get matched case insensitively against alias lists taken from
// LubeLogger's ImportMappers (MIT). Rows are fuel by default and a
// Type column with service or expense values types those rows. For
// volumes an explicitly gallons or litres column wins, otherwise the
// target vehicles volume unit decides.

const ALIASES: Record<string, string[]> = {
  date: ['date', 'fuelup_date', 'fill_date'],
  day: ['day'],
  month: ['month'],
  year: ['year'],
  odometer: ['odometer', 'odo', 'mileage', 'kilometers', 'kilometres'],
  gallons: ['gallons', 'gallon'],
  litres: ['liters', 'litres', 'litre', 'liter'],
  qty: ['consumption', 'quantity', 'qty', 'fuelconsumed', 'volume', 'fuel'],
  cost: ['cost', 'total cost', 'totalcost', 'total price', 'totalprice', 'amount', 'price total'],
  price: ['price', 'priceperunit', 'unit price', 'price per unit', 'pricepergallon', 'price per gallon', 'priceperlitre'],
  partial: ['partial_fuelup', 'partial tank', 'partial_fill', 'partial', 'partial fill'],
  full: ['isfilltofull', 'filled up', 'full', 'filltofull'],
  missed: ['missed_fuelup', 'missedfuelup', 'missed fill up', 'missed_fill', 'missed'],
  notes: ['notes', 'note', 'comments', 'comment'],
  title: ['description', 'name', 'title', 'service', 'expense'],
  type: ['type', 'record type', 'recordtype']
};

function aliasCols(headers: string[]): Record<string, number> {
  const norm = headers.map((h) => h.trim().toLowerCase().replace(/_/g, ' '));
  const out: Record<string, number> = {};
  for (const [key, aliases] of Object.entries(ALIASES)) {
    const normAliases = aliases.map((a) => a.replace(/_/g, ' '));
    out[key] = norm.findIndex((h) => normAliases.includes(h));
  }
  return out;
}

function parseFlexDate(s: string): string | null {
  const t = String(s ?? '').trim();
  if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (m) return isoLocal(+m[1], +m[2], +m[3], m[4] ? +m[4] : 12, m[5] ? +m[5] : 0);
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) return isoLocal(+m[3], +m[1], +m[2], m[4] ? +m[4] : 12, m[5] ? +m[5] : 0);
  const d = new Date(t);
  if (!isNaN(d.getTime())) return d.toISOString();
  return null;
}

function truthy(v: string | undefined): boolean {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'yes' || s === 'true' || s === '1' || s === 'y';
}

export function scanGeneric(
  text: string,
  fileName: string,
  target: { id: number; name: string; volumeUnit: string }
): ScanResult {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ''));
  if (rows.length < 2) throw new Error('No data rows found in that file.');
  const c = aliasCols(rows[0]);
  const hasDate = c.date >= 0 || (c.day >= 0 && c.month >= 0 && c.year >= 0);
  if (!hasDate) throw new Error('Could not find a date column (tried: date, fuelup_date, or day + month + year).');
  if (c.odometer < 0 && c.gallons < 0 && c.litres < 0 && c.qty < 0 && c.cost < 0) {
    throw new Error('Could not find odometer, fuel quantity, or cost columns in that CSV.');
  }
  const targetGal = target.volumeUnit === 'Gallons';
  const vehicle = blankVehicle(target.name);
  let skipped = 0;
  for (const row of rows.slice(1)) {
    let dt: string | null = null;
    if (c.date >= 0) dt = parseFlexDate(row[c.date]);
    if (!dt && c.day >= 0 && c.month >= 0 && c.year >= 0) {
      dt = isoLocal(num(row[c.year]) ?? 0, num(row[c.month]) ?? 0, num(row[c.day]) ?? 0);
    }
    if (!dt) {
      skipped++;
      continue;
    }
    const typeRaw = c.type >= 0 ? String(row[c.type] ?? '').trim().toLowerCase() : '';
    const type = typeRaw.includes('service') ? 'service' : typeRaw.includes('expense') ? 'expense' : 'fuel';
    let volume: number | null = null;
    let volIsGal: boolean | null = null;
    if (c.gallons >= 0) {
      volume = num(row[c.gallons]);
      volIsGal = true;
    } else if (c.litres >= 0) {
      volume = num(row[c.litres]);
      volIsGal = false;
    } else if (c.qty >= 0) {
      volume = num(row[c.qty]);
      volIsGal = targetGal;
    }
    const volFactor = volIsGal === null ? 1 : volIsGal ? GAL_US : 1;
    if (volume !== null) volume = volume * volFactor;
    let total = c.cost >= 0 ? num(row[c.cost]) : null;
    let price = c.price >= 0 ? num(row[c.price]) : null;
    if (price !== null && volIsGal) price = price / GAL_US;
    if (type === 'fuel') {
      if (total === null && price !== null && volume !== null) total = price * volume;
      if (price === null && total !== null && volume !== null && volume > 0) price = total / volume;
    }
    let partial = c.partial >= 0 ? truthy(row[c.partial]) : false;
    if (c.full >= 0 && String(row[c.full] ?? '').trim() !== '') partial = !truthy(row[c.full]);
    vehicle.records.push(
      rec({
        type,
        title: type === 'fuel' ? '' : c.title >= 0 ? String(row[c.title] ?? '').trim() : '',
        datetime: dt,
        odometer: c.odometer >= 0 ? num(row[c.odometer]) : null,
        pricePerUnit: type === 'fuel' ? price : null,
        volume: type === 'fuel' ? volume : null,
        totalCost: total,
        partial,
        missed: c.missed >= 0 ? truthy(row[c.missed]) : false,
        notes: c.notes >= 0 ? String(row[c.notes] ?? '').trim() : ''
      })
    );
  }
  if (vehicle.records.length === 0) throw new Error('No importable rows found in that CSV.');
  return summarize({
    kind: 'generic',
    kindLabel: 'Generic CSV',
    fileName,
    target: 'selected',
    targetVehicleId: target.id,
    targetVehicleName: target.name,
    vehicles: [vehicle],
    skippedRows: skipped,
    note: 'Columns were matched by name (LubeLogger-style aliases). Quantities without an explicit unit use the vehicle\'s volume unit.'
  });
}

// Simply Auto (formerly Fuel Buddy), the Fuel_Log.csv file. Field
// order from the official import guide: Row ID, Vehicle ID, Odometer,
// Qty, Partial Tank, Missed Fill Up, Total Cost, Distance Traveled,
// Eff, Octane, Fuel Brand, Filling Station, Notes, Day, Month, Year,
// Receipt Path, Record Type (0=Fuel 1=Service 2=Expense), Record
// Desc. Headers get matched by name with positional fallback in that
// order. The file's Vehicle ID can't be resolved without Vehicles.csv,
// so records go into the selected vehicle. Units are not in the file,
// quantities use the target vehicles volume unit and odometers its
// distance unit.

export function scanSimplyAuto(
  text: string,
  fileName: string,
  target: { id: number; name: string; volumeUnit: string; distanceUnit: string }
): ScanResult {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ''));
  if (rows.length < 2) throw new Error('No data rows found in that file.');
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  if (headers.some((h) => h.includes('lic#') || h.includes('vehicle id')) && headers.some((h) => h === 'make') && !headers.some((h) => h.includes('odometer'))) {
    throw new Error('That looks like Simply Auto\'s Vehicles.csv - choose the Fuel_Log.csv file instead.');
  }
  const byName = (names: string[], pos: number): number => {
    const i = headers.findIndex((h) => names.includes(h));
    return i >= 0 ? i : pos;
  };
  const iOdo = byName(['odometer'], 2);
  const iQty = byName(['qty', 'quantity'], 3);
  const iPartial = byName(['partial tank', 'partial fill', 'partial'], 4);
  const iMissed = byName(['missed fill up', 'missed'], 5);
  const iTotal = byName(['total cost', 'total'], 6);
  const iStation = byName(['filling station', 'station'], 11);
  const iNotes = byName(['notes', 'note'], 12);
  const iDay = byName(['day'], 13);
  const iMonth = byName(['month'], 14);
  const iYear = byName(['year'], 15);
  const iType = byName(['record type'], 17);
  const iDesc = byName(['record desc', 'record description'], 18);
  if (iDay < 0 || iMonth < 0 || iYear < 0) {
    throw new Error('That does not look like a Simply Auto Fuel_Log.csv (no Day/Month/Year columns).');
  }
  const volFactor = target.volumeUnit === 'Gallons' ? GAL_US : 1;
  const odoFactor = target.distanceUnit === 'Miles' ? MI_KM : 1;
  const vehicle = blankVehicle(target.name);
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const dt = isoLocal(num(r[iYear]) ?? 0, num(r[iMonth]) ?? 0, num(r[iDay]) ?? 0);
    if (!dt) {
      skipped++;
      continue;
    }
    const typeCode = num(r[iType]);
    const type = typeCode === 1 ? 'service' : typeCode === 2 ? 'expense' : 'fuel';
    const total = num(r[iTotal]);
    const desc = String(r[iDesc] ?? '').trim();
    if (type === 'fuel') {
      let volume = num(r[iQty]);
      if (volume !== null) volume = volume * volFactor;
      const price = total !== null && volume !== null && volume > 0 ? total / volume : null;
      let notes = String(r[iNotes] ?? '').trim();
      const station = String(r[iStation] ?? '').trim();
      if (station) notes = notes ? `${notes} (${station})` : station;
      vehicle.records.push(
        rec({
          datetime: dt,
          odometer: num(r[iOdo]) === null ? null : (num(r[iOdo]) as number) * odoFactor,
          volume,
          totalCost: total,
          pricePerUnit: price,
          partial: truthy(r[iPartial]),
          missed: truthy(r[iMissed]),
          notes
        })
      );
    } else {
      vehicle.records.push(
        rec({
          type,
          title: desc === 'Fuel Record' ? '' : desc,
          datetime: dt,
          odometer: num(r[iOdo]) === null ? null : (num(r[iOdo]) as number) * odoFactor,
          totalCost: total,
          notes: String(r[iNotes] ?? '').trim()
        })
      );
    }
  }
  if (vehicle.records.length === 0) throw new Error('No importable rows found in that file.');
  return summarize({
    kind: 'simplyauto',
    kindLabel: 'Simply Auto',
    fileName,
    target: 'selected',
    targetVehicleId: target.id,
    targetVehicleName: target.name,
    vehicles: [vehicle],
    skippedRows: skipped,
    note: 'Simply Auto files do not record units - quantities use the selected vehicle\'s units.'
  });
}

// Drivvo CSV, a sectioned file. Headers are localized so this reads
// positionally: Refuelling 0=odometer, 1=date (D/M/YYYY), 2=fuel
// type, 3=price per unit, 4=total, 5=volume, 6=full fill (localized
// yes word), 18=notes. Expense 0=odo, 1=date, 2=cost, 3=title,
// 6=notes. Service 0=odo, 1=date, 2=cost, 3=title, 5=notes. Units
// are not in the file, kilometres and litres are assumed and the
// summary says so before anything gets imported.

const DRIVVO_YES = ['yes', 'si', 'sí', 'sim', 'tak', 'ja', 'oui', 'evet', 'да', 'ano'];

export function scanDrivvo(text: string, fileName: string): ScanResult {
  const sections = splitSections(text);
  const find = (...names: string[]) =>
    sections.find((s) => names.some((n) => s.marker.replace(/[^a-z]/g, '').includes(n)));
  const refSec = find('refuelling', 'refueling', 'reabastecimiento', 'abastecimento');
  const expSec = find('expense', 'despesa', 'gasto');
  const svcSec = find('service', 'servico', 'serviço');
  const vehSec = find('vehicle', 'veiculo', 'vehiculo');
  if (!refSec && !expSec && !svcSec) {
    throw new Error('That does not look like a Drivvo export (no refuelling/expense/service sections).');
  }
  let vehName = 'Drivvo Vehicle';
  if (vehSec) {
    const { rows } = sectionRows(vehSec.body);
    // The vehicle rows column layout is not consistently documented,
    // so take the first plausible text cell from the first data row.
    const firstText = (rows[0] ?? []).find((c) => c.trim().length > 1 && isNaN(Number(c)));
    if (firstText) vehName = firstText.trim();
  }
  const vehicle = blankVehicle(vehName);
  let skipped = 0;
  const drivvoDate = (s: string): string | null => {
    const m = String(s ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    return m ? isoLocal(+m[3], +m[2], +m[1]) : null;
  };
  const pushRows = (sec: { body: string } | undefined, mode: 'fuel' | 'expense' | 'service') => {
    if (!sec) return;
    const { rows } = sectionRows(sec.body);
    for (const r of rows) {
      const dt = drivvoDate(r[1]);
      if (!dt) {
        skipped++;
        continue;
      }
      if (mode === 'fuel') {
        const price = num(r[3]);
        const total = num(r[4]);
        const volume = num(r[5]);
        const fullWord = String(r[6] ?? '').trim().toLowerCase();
        vehicle.records.push(
          rec({
            datetime: dt,
            odometer: num(r[0]),
            pricePerUnit: price,
            totalCost: total,
            volume,
            partial: fullWord !== '' && !DRIVVO_YES.includes(fullWord),
            notes: r.length > 18 ? String(r[18] ?? '').trim() : ''
          })
        );
      } else {
        vehicle.records.push(
          rec({
            type: mode,
            title: String(r[3] ?? '').trim(),
            datetime: dt,
            odometer: num(r[0]),
            totalCost: num(r[2]),
            notes: String(r[mode === 'expense' ? 6 : 5] ?? '').trim()
          })
        );
      }
    }
  };
  pushRows(refSec, 'fuel');
  pushRows(expSec, 'expense');
  pushRows(svcSec, 'service');
  if (vehicle.records.length === 0) throw new Error('No importable rows found in that Drivvo export.');
  vehicle.records.sort((a, b) => (a.datetime < b.datetime ? -1 : 1));
  return summarize({
    kind: 'drivvo',
    kindLabel: 'Drivvo',
    fileName,
    target: 'new',
    targetVehicleId: null,
    targetVehicleName: null,
    vehicles: [vehicle],
    skippedRows: skipped,
    note: 'Drivvo files do not record units - kilometres and litres are assumed.'
  });
}

// Spritmonitor.de, semicolon separated CSVs with decimal commas and
// DD.MM.YYYY dates. Two files per vehicle, fuelings (Quantity and
// Consumption columns) and costs (a Cost type column). Enum labels
// come from the published tables. Values are taken as km and litres.
// Goes into the selected vehicle.

const SPRITMONITOR_COST_TYPES: Record<number, { label: string; service: boolean }> = {
  1: { label: 'Maintenance', service: true },
  2: { label: 'Repair', service: true },
  3: { label: 'Care', service: false },
  4: { label: 'Change oil', service: true },
  5: { label: 'Insurance', service: false },
  6: { label: 'Tax', service: false },
  7: { label: 'Parking', service: false },
  8: { label: 'Tolls', service: false },
  9: { label: 'Other', service: false },
  10: { label: 'Financing', service: false }
};

export function scanSpritmonitor(
  text: string,
  fileName: string,
  target: { id: number; name: string }
): ScanResult {
  if (!text.includes(';')) throw new Error('That does not look like a Spritmonitor CSV (it should be semicolon-separated).');
  const rows = parseCsv(text, ';').filter((r) => r.some((c) => c.trim() !== ''));
  if (rows.length < 2) throw new Error('No data rows found in that file.');
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const iDate = headers.findIndex((h) => h === 'date');
  const iOdo = headers.findIndex((h) => h === 'odometer');
  if (iDate < 0 || iOdo < 0) throw new Error('That Spritmonitor CSV is missing its Date/Odometer columns.');
  const dnum = (v: string | undefined): number | null => num(v, true);
  const spritDate = (s: string): string | null => {
    const m = String(s ?? '').trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    return m ? isoLocal(+m[3], +m[2], +m[1]) : null;
  };
  const iQty = headers.findIndex((h) => h === 'quantity');
  const iTotal = headers.findIndex((h) => h === 'total price');
  const iNote = headers.findIndex((h) => h === 'note');
  const iType = headers.findIndex((h) => h === 'type');
  const iCompany = headers.findIndex((h) => h === 'company');
  const iCostType = headers.findIndex((h) => h === 'cost type');
  const vehicle = blankVehicle(target.name);
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const dt = spritDate(r[iDate]);
    if (!dt) {
      skipped++;
      continue;
    }
    if (iCostType >= 0) {
      const code = num(r[iCostType]) ?? 9;
      const meta = SPRITMONITOR_COST_TYPES[code] ?? { label: String(r[iCostType] ?? 'Cost'), service: false };
      vehicle.records.push(
        rec({
          type: meta.service ? 'service' : 'expense',
          title: meta.label,
          datetime: dt,
          odometer: dnum(r[iOdo]),
          totalCost: iTotal >= 0 ? dnum(r[iTotal]) : null,
          notes: iNote >= 0 ? String(r[iNote] ?? '').trim() : ''
        })
      );
    } else if (iQty >= 0) {
      const volume = dnum(r[iQty]);
      const total = iTotal >= 0 ? dnum(r[iTotal]) : null;
      let notes = iNote >= 0 ? String(r[iNote] ?? '').trim() : '';
      const company = iCompany >= 0 ? String(r[iCompany] ?? '').trim() : '';
      if (company) notes = notes ? `${notes} (${company})` : company;
      const typeCode = iType >= 0 ? num(r[iType]) : 1;
      vehicle.records.push(
        rec({
          datetime: dt,
          odometer: dnum(r[iOdo]),
          volume,
          totalCost: total,
          pricePerUnit: total !== null && volume !== null && volume > 0 ? total / volume : null,
          partial: typeCode === 2,
          notes
        })
      );
    } else {
      skipped++;
    }
  }
  if (vehicle.records.length === 0) throw new Error('No importable rows found in that file.');
  return summarize({
    kind: 'spritmonitor',
    kindLabel: 'Spritmonitor',
    fileName,
    target: 'selected',
    targetVehicleId: target.id,
    targetVehicleName: target.name,
    vehicles: [vehicle],
    skippedRows: skipped,
    note: null
  });
}

// Motostat.pl, one semicolon separated CSV with exactly 23
// documented columns: cost_id, fueling_id, cost_type, date, fuel_id,
// gas_station_id, odometer, trip_odometer, quantity, cost, notes,
// fueling_type, tires, driving_style, route flags, bc_*, ac,
// currency, fuel_name, gas_station_name. Fuel rows carry a
// fueling_id and cost rows a cost_id. Always km and litres, goes
// into the selected vehicle.

export function scanMotostat(
  text: string,
  fileName: string,
  target: { id: number; name: string }
): ScanResult {
  const rows = parseCsv(text, ';').filter((r) => r.some((c) => c.trim() !== ''));
  if (rows.length < 2) throw new Error('No data rows found in that file.');
  const first = rows[0];
  const hasHeader = String(first[0]).trim().toLowerCase() === 'cost_id' || String(first[1]).trim().toLowerCase() === 'fueling_id';
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const vehicle = blankVehicle(target.name);
  let skipped = 0;
  for (const r of dataRows) {
    if (r.length < 11) {
      skipped++;
      continue;
    }
    const m = String(r[3] ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    const dt = m ? isoLocal(+m[1], +m[2], +m[3]) : null;
    if (!dt) {
      skipped++;
      continue;
    }
    const isFuel = String(r[1] ?? '').trim() !== '';
    const station = String(r[22] ?? '').trim();
    let notes = String(r[10] ?? '').trim();
    if (isFuel) {
      const volume = num(r[8]);
      const total = num(r[9]);
      if (station) notes = notes ? `${notes} (${station})` : station;
      vehicle.records.push(
        rec({
          datetime: dt,
          odometer: num(r[6]),
          volume,
          totalCost: total,
          pricePerUnit: total !== null && volume !== null && volume > 0 ? total / volume : null,
          partial: /partial/i.test(String(r[11] ?? '')),
          notes
        })
      );
    } else {
      const costType = String(r[2] ?? '').trim();
      vehicle.records.push(
        rec({
          type: /service|repair|maintenance|oil/i.test(costType) ? 'service' : 'expense',
          title: costType,
          datetime: dt,
          odometer: num(r[6]),
          totalCost: num(r[9]),
          notes
        })
      );
    }
  }
  if (vehicle.records.length === 0) throw new Error('No importable rows found in that file.');
  return summarize({
    kind: 'motostat',
    kindLabel: 'Motostat',
    fileName,
    target: 'selected',
    targetVehicleId: target.id,
    targetVehicleName: target.name,
    vehicles: [vehicle],
    skippedRows: skipped,
    note: null
  });
}

// Fuel Log (legacy Android app), a sectioned CSV covering all
// vehicles. The "## vehicles" section: make, model, note, distance
// code, volume code, consumption code (distance 1=km, 2=mi, volume
// 1=L, 2=US gal, 3=UK gal). Fill ups: make, model, date (D/M/YYYY),
// mileage, fuel, price per unit, partial, note. Costs: make, model,
// title, date, mileage, costs, note, recurrence. Rows key vehicles
// by make plus model.

export function scanFuelLog(text: string, fileName: string): ScanResult {
  const sections = splitSections(text);
  const vehSec = sections.find((s) => s.marker === 'vehicles');
  if (!vehSec) throw new Error('That does not look like a Fuel Log export (no ## vehicles section).');
  const vehicles = new Map<string, ScanVehicle & { distCode: number; volCode: number }>();
  const key = (make: string, model: string) => `${make.trim().toLowerCase()}|${model.trim().toLowerCase()}`;
  {
    const { rows } = sectionRows(vehSec.body);
    for (const r of rows) {
      const make = String(r[0] ?? '').trim();
      const model = String(r[1] ?? '').trim();
      if (!make && !model) continue;
      const sv = blankVehicle([make, model].filter(Boolean).join(' ') || 'Vehicle') as ScanVehicle & {
        distCode: number;
        volCode: number;
      };
      sv.make = make;
      sv.model = model;
      sv.distCode = num(r[3]) ?? 1;
      sv.volCode = num(r[4]) ?? 1;
      sv.distanceUnit = sv.distCode === 2 ? 'Miles' : 'Kilometers';
      sv.volumeUnit = sv.volCode === 1 ? 'Liters' : 'Gallons';
      vehicles.set(key(make, model), sv);
    }
  }
  const getVeh = (make: string, model: string) => {
    let v = vehicles.get(key(make, model));
    if (!v) {
      v = blankVehicle([make, model].filter(Boolean).join(' ') || 'Vehicle') as ScanVehicle & {
        distCode: number;
        volCode: number;
      };
      (v as any).distCode = 1;
      (v as any).volCode = 1;
      vehicles.set(key(make, model), v);
    }
    return v;
  };
  const flDate = (s: string): string | null => {
    const m = String(s ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    return m ? isoLocal(+m[3], +m[2], +m[1]) : null;
  };
  let skipped = 0;
  const fillSec = sections.find((s) => /fill|fuel/.test(s.marker));
  if (fillSec) {
    const { rows } = sectionRows(fillSec.body);
    for (const r of rows) {
      const v = getVeh(String(r[0] ?? ''), String(r[1] ?? ''));
      const dt = flDate(r[2]);
      if (!dt) {
        skipped++;
        continue;
      }
      const odoFactor = (v as any).distCode === 2 ? MI_KM : 1;
      const volFactor = (v as any).volCode === 2 ? GAL_US : (v as any).volCode === 3 ? GAL_UK : 1;
      const volRaw = num(r[4]);
      const volume = volRaw === null ? null : volRaw * volFactor;
      let price = num(r[5]);
      if (price !== null && volFactor !== 1) price = price / volFactor;
      v.records.push(
        rec({
          datetime: dt,
          odometer: num(r[3]) === null ? null : (num(r[3]) as number) * odoFactor,
          volume,
          pricePerUnit: price,
          totalCost: price !== null && volume !== null ? price * volume : null,
          partial: truthy(r[6]),
          notes: String(r[7] ?? '').trim()
        })
      );
    }
  }
  const costSec = sections.find((s) => /cost|expense/.test(s.marker));
  if (costSec) {
    const { rows } = sectionRows(costSec.body);
    for (const r of rows) {
      const v = getVeh(String(r[0] ?? ''), String(r[1] ?? ''));
      const dt = flDate(r[3]);
      if (!dt) {
        skipped++;
        continue;
      }
      const odoFactor = (v as any).distCode === 2 ? MI_KM : 1;
      v.records.push(
        rec({
          type: 'expense',
          title: String(r[2] ?? '').trim(),
          datetime: dt,
          odometer: num(r[4]) === null ? null : (num(r[4]) as number) * odoFactor,
          totalCost: num(r[5]),
          notes: String(r[6] ?? '').trim()
        })
      );
    }
  }
  const list = [...vehicles.values()].filter((v) => v.records.length > 0);
  if (list.length === 0) throw new Error('No records found in that Fuel Log export.');
  for (const v of list) v.records.sort((a, b) => (a.datetime < b.datetime ? -1 : 1));
  return summarize({
    kind: 'fuellog',
    kindLabel: 'Fuel Log',
    fileName,
    target: 'new',
    targetVehicleId: null,
    targetVehicleName: null,
    vehicles: list,
    skippedRows: skipped,
    note: null
  });
}

// Executors, only ever called after the user confirms a scan.

import { db, records, vehicles, vehicleParts, locations, userSettings } from './db';

export interface NormalizedImportResult {
  vehicleCount: number;
  recordCount: number;
  firstVehicleId: number | null;
}

/** Inserts a normalized scan. New vehicles for target 'new', or all
 *  records into the stashed target vehicle for target 'selected'. */
export async function executeNormalizedImport(
  userId: number,
  scan: ScanResult
): Promise<NormalizedImportResult> {
  const now = new Date().toISOString();
  let recordCount = 0;
  if (scan.target === 'selected') {
    const vid = scan.targetVehicleId;
    if (vid === null) throw new Error('No target vehicle for this import.');
    for (const v of scan.vehicles) {
      for (const r of v.records) {
        await db.insert(records).values({
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
          locationId: null,
          createdAt: now
        });
        recordCount++;
      }
    }
    return { vehicleCount: 0, recordCount, firstVehicleId: vid };
  }
  let firstVehicleId: number | null = null;
  let vehicleCount = 0;
  for (const v of scan.vehicles) {
    const inserted = await db
      .insert(vehicles)
      .values({
        ownerId: userId,
        name: v.name,
        year: v.year,
        make: v.make,
        model: v.model,
        submodel: '',
        engine: '',
        transmission: '',
        driveType: '',
        bodyType: '',
        distanceUnit: v.distanceUnit,
        volumeUnit: v.volumeUnit,
        licensePlate: v.licensePlate,
        vin: v.vin,
        tankCapacity: null,
        notes: '',
        purchasedOdometer: null,
        purchasedPrice: null,
        purchasedDate: '',
        purchasedNotes: '',
        soldOdometer: null,
        soldPrice: null,
        soldDate: '',
        soldNotes: '',
        active: 1,
        costTracking: 0,
        createdAt: now
      })
      .returning({ id: vehicles.id });
    const vid = inserted[0].id;
    if (firstVehicleId === null) firstVehicleId = vid;
    vehicleCount++;
    for (const r of v.records) {
      await db.insert(records).values({
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
        locationId: null,
        createdAt: now
      });
      recordCount++;
    }
  }
  return { vehicleCount, recordCount, firstVehicleId };
}

/** Restores a jCar JSON backup. */
export async function executeJcarBackup(
  userId: number,
  parsed: any
): Promise<NormalizedImportResult> {
  let vehicleCount = 0;
  let recordCount = 0;
  let firstVehicleId: number | null = null;
  for (const v of parsed.vehicles) {
    const { parts = [], records: recs = [], ...veh } = v;
    const inserted = await db
      .insert(vehicles)
      .values({
        ownerId: userId,
        name: String(veh.name ?? 'Vehicle'),
        year: veh.year ?? '',
        make: veh.make ?? '',
        model: veh.model ?? '',
        submodel: veh.submodel ?? '',
        engine: veh.engine ?? '',
        transmission: veh.transmission ?? '',
        driveType: veh.driveType ?? '',
        bodyType: veh.bodyType ?? '',
        distanceUnit: veh.distanceUnit ?? 'Kilometers',
        volumeUnit: veh.volumeUnit ?? 'Liters',
        licensePlate: veh.licensePlate ?? '',
        vin: veh.vin ?? '',
        tankCapacity: veh.tankCapacity ?? null,
        notes: veh.notes ?? '',
        purchasedOdometer: veh.purchasedOdometer ?? null,
        purchasedPrice: veh.purchasedPrice ?? null,
        purchasedDate: veh.purchasedDate ?? '',
        purchasedNotes: veh.purchasedNotes ?? '',
        soldOdometer: veh.soldOdometer ?? null,
        soldPrice: veh.soldPrice ?? null,
        soldDate: veh.soldDate ?? '',
        soldNotes: veh.soldNotes ?? '',
        active: veh.active === 0 ? 0 : 1,
        costTracking: veh.costTracking ? 1 : 0,
        createdAt: new Date().toISOString()
      })
      .returning({ id: vehicles.id });
    const vid = inserted[0].id;
    if (firstVehicleId === null) firstVehicleId = vid;
    vehicleCount++;
    for (const p of parts) {
      await db.insert(vehicleParts).values({
        vehicleId: vid,
        name: String(p.name ?? ''),
        partNumber: p.partNumber ?? '',
        type: p.type ?? '',
        brand: p.brand ?? '',
        size: p.size ?? '',
        volume: p.volume ?? '',
        pressure: p.pressure ?? '',
        quantity: p.quantity ?? null,
        notes: p.notes ?? ''
      });
    }
    for (const r of recs) {
      await db.insert(records).values({
        vehicleId: vid,
        userId,
        type: ['fuel', 'service', 'expense', 'note'].includes(r.type) ? r.type : 'fuel',
        title: r.title ?? '',
        datetime: r.datetime ?? new Date().toISOString(),
        odometer: r.odometer ?? null,
        pricePerUnit: r.pricePerUnit ?? null,
        volume: r.volume ?? null,
        totalCost: r.totalCost ?? null,
        partial: r.partial ? 1 : 0,
        missed: r.missed ? 1 : 0,
        notes: r.notes ?? '',
        locationId: null,
        createdAt: new Date().toISOString()
      });
      recordCount++;
    }
  }
  for (const l of parsed.locations ?? []) {
    await db.insert(locations).values({
      userId,
      street: l.street ?? '',
      city: l.city ?? '',
      province: l.province ?? '',
      postalCode: l.postalCode ?? '',
      country: l.country ?? '',
      notes: l.notes ?? ''
    });
  }
  if (parsed.settings) {
    const st = {
      userId,
      dateFormat: parsed.settings.dateFormat ?? 'mdy',
      distanceUnit: parsed.settings.distanceUnit ?? 'Kilometers',
      volumeUnit: parsed.settings.volumeUnit ?? 'Liters',
      efficiencyUnit: parsed.settings.efficiencyUnit ?? 'L/100km'
    };
    await db
      .insert(userSettings)
      .values(st)
      .onConflictDoUpdate({ target: userSettings.userId, set: st });
  }
  return { vehicleCount, recordCount, firstVehicleId };
}
