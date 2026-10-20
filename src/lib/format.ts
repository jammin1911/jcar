// display formatting helpers, safe on the client and the server

export interface DisplaySettings {
  dateFormat: string; // 'mdy' | 'iso' | 'dmy'
  distanceUnit: string; // 'Kilometers' | 'Miles'
  volumeUnit: string; // 'Liters' | 'Gallons'
  efficiencyUnit: string; // 'L/100km' | 'MPG (US)'
  theme: string; // 'light' | 'dark'
}

export const DEFAULT_SETTINGS: DisplaySettings = {
  dateFormat: 'mdy',
  distanceUnit: 'Kilometers',
  volumeUnit: 'Liters',
  efficiencyUnit: 'L/100km',
  theme: 'light'
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** format an ISO datetime per the users date format setting */
export function fmtDateTime(iso: string | null | undefined, s: DisplaySettings): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const time24 = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (s.dateFormat === 'iso') {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${time24}`;
  }
  let h = d.getHours();
  const suffix = h >= 12 ? 'p.m.' : 'a.m.';
  h = h % 12;
  if (h === 0) h = 12;
  const time12 = `${pad(h)}:${pad(d.getMinutes())} ${suffix}`;
  if (s.dateFormat === 'dmy') {
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} - ${time24}`;
  }
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} - ${time12}`;
}

/** short date, no time, per the users setting */
export function fmtDate(iso: string | null | undefined, s: DisplaySettings): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  if (s.dateFormat === 'iso') return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (s.dateFormat === 'dmy') return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function fmtMoney(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || isNaN(n)) return '';
  return '$' + n.toLocaleString('en-CA', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtNum(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || isNaN(n)) return '';
  return n.toLocaleString('en-CA', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** efficiency is stored as L/100km, this gives it in the users unit */
export function effValue(l100: number, s: DisplaySettings): number {
  if (s.efficiencyUnit === 'MPG (US)') {
    return l100 > 0 ? 235.214583 / l100 : 0;
  }
  return l100;
}

export function effUnitLabel(s: DisplaySettings): string {
  return s.efficiencyUnit === 'MPG (US)' ? 'MPG' : 'L/100';
}

/** km in the users distance unit */
export function distValue(km: number, s: DisplaySettings): number {
  return s.distanceUnit === 'Miles' ? km / 1.60934 : km;
}
export function distLabel(s: DisplaySettings): string {
  return s.distanceUnit === 'Miles' ? 'mi' : 'km';
}

/** litres in the users volume unit */
export function volValue(l: number, s: DisplaySettings): number {
  return s.volumeUnit === 'Gallons' ? l / 3.78541 : l;
}
export function volLabel(s: DisplaySettings): string {
  return s.volumeUnit === 'Gallons' ? 'gal' : 'L';
}

/** default value for datetime-local inputs, local time to the minute */
export function nowLocalInput(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
