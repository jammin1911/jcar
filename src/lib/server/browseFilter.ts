// Browse Records filtering. Which vehicles' records to show,
// which record types, and a date range.
// State travels in the /browse URL params so it is bookmarkable and
// needs no client JS, like ?vehicles=3,7&types=fuel,service.
// Defaults are the dashboard selected vehicle, all types, everything.

export const ALL_REC_TYPES = ['fuel', 'service', 'expense', 'note'] as const;

export const RANGE_OPTIONS = [
  { key: 'everything', label: 'Everything' },
  { key: 'recent-3m', label: 'Recent 3 Months' },
  { key: 'recent-6m', label: 'Recent 6 Months' },
  { key: 'recent-1y', label: 'Recent Year' },
  { key: 'recent-2y', label: 'Recent 2 Years' },
  { key: 'this-year', label: 'This Year' },
  { key: 'last-year', label: 'Last Year' },
  { key: 'this-month', label: 'This Month' },
  { key: 'last-month', label: 'Last Month' },
  { key: 'custom', label: 'Custom' }
] as const;

export type RangeKey = (typeof RANGE_OPTIONS)[number]['key'];

export interface BrowseFilter {
  vehicleIds: number[];
  types: string[];
  range: RangeKey;
  from: string; // YYYY-MM-DD, custom only
  to: string;
  /** true when anything deviates from the defaults */
  active: boolean;
}

export function parseBrowseFilter(url: URL, accessibleIds: number[], defaultVehicleId: number): BrowseFilter {
  // Checkbox groups in a GET form send repeated params while links
  // use comma joined values, so accept both. Plain searchParams.get
  // would silently keep only the first vehicle and type.
  const allValues = (key: string) =>
    url.searchParams
      .getAll(key)
      .flatMap((v) => v.split(','))
      .map((x) => x.trim())
      .filter(Boolean);

  const rawVehicles = allValues('vehicles')
    .map((x) => Number(x))
    .filter((n) => Number.isInteger(n) && accessibleIds.includes(n));
  const vehicleIds = rawVehicles.length ? [...new Set(rawVehicles)] : [defaultVehicleId];

  const rawTypes = allValues('types').filter((t) => (ALL_REC_TYPES as readonly string[]).includes(t));
  const types = rawTypes.length ? [...new Set(rawTypes)] : [...ALL_REC_TYPES];

  const rawRange = url.searchParams.get('range') ?? 'everything';
  const range: RangeKey = RANGE_OPTIONS.some((r) => r.key === rawRange)
    ? (rawRange as RangeKey)
    : 'everything';

  const dateOk = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  const fromParam = url.searchParams.get('from') ?? '';
  const toParam = url.searchParams.get('to') ?? '';
  const from = dateOk(fromParam) ? fromParam : '';
  const to = dateOk(toParam) ? toParam : '';

  const active =
    url.searchParams.has('vehicles') ||
    url.searchParams.has('types') ||
    (range !== 'everything' && url.searchParams.has('range'));

  return { vehicleIds, types, range, from, to, active };
}

/** Millisecond window [start, end) for a range, or null for "everything". */
export function rangeWindow(f: BrowseFilter): { start: number; end: number } | null {
  if (f.range === 'everything') return null;
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const monthsAgo = (n: number) => {
    const d = new Date(now.getFullYear(), now.getMonth() - n, now.getDate());
    return d.getTime();
  };
  switch (f.range) {
    case 'recent-3m':
      return { start: monthsAgo(3), end: Number.POSITIVE_INFINITY };
    case 'recent-6m':
      return { start: monthsAgo(6), end: Number.POSITIVE_INFINITY };
    case 'recent-1y':
      return { start: monthsAgo(12), end: Number.POSITIVE_INFINITY };
    case 'recent-2y':
      return { start: monthsAgo(24), end: Number.POSITIVE_INFINITY };
    case 'this-year':
      return { start: new Date(now.getFullYear(), 0, 1).getTime(), end: Number.POSITIVE_INFINITY };
    case 'last-year':
      return {
        start: new Date(now.getFullYear() - 1, 0, 1).getTime(),
        end: new Date(now.getFullYear(), 0, 1).getTime()
      };
    case 'this-month':
      return { start: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), end: Number.POSITIVE_INFINITY };
    case 'last-month':
      return {
        start: new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime(),
        end: new Date(now.getFullYear(), now.getMonth(), 1).getTime()
      };
    case 'custom': {
      const start = f.from ? startOfDay(new Date(`${f.from}T12:00:00`)) : Number.NEGATIVE_INFINITY;
      const end = f.to ? startOfDay(new Date(`${f.to}T12:00:00`)) + 86400000 : Number.POSITIVE_INFINITY;
      return { start, end };
    }
  }
}

/** Query string carrying a filter (for links between /browse and /browse/filter). */
export function filterQuery(f: BrowseFilter): string {
  const p = new URLSearchParams();
  p.set('vehicles', f.vehicleIds.join(','));
  p.set('types', f.types.join(','));
  p.set('range', f.range);
  if (f.range === 'custom') {
    if (f.from) p.set('from', f.from);
    if (f.to) p.set('to', f.to);
  }
  return p.toString();
}
