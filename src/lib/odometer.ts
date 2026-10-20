/** group thousands with commas, no forced decimal, 162448.0 shows as
 *  162,448 but a real decimal like 162448.5 keeps it */
export function fmtOdometer(v: number | string | null | undefined): string {
  if (v == null) return '';
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
  if (isNaN(n)) return '';
  return n.toLocaleString('en-CA', { maximumFractionDigits: 3 });
}

export function ungroupOdometer(v: unknown): string {
  return String(v ?? '').replace(/,/g, '');
}

function groupRaw(raw: string): string {
  const s = raw.replace(/[^0-9.]/g, '');
  const dot = s.indexOf('.');
  const int = dot === -1 ? s : s.slice(0, dot);
  const frac = dot === -1 ? null : s.slice(dot + 1).replace(/\./g, '');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac === null ? grouped : `${grouped}.${frac}`;
}

/**
 * oninput handler for odometer text inputs, reformats with comma
 * grouping as you type and puts the caret back by counting the digits
 * and decimal point that were before it, so editing in the middle
 * does not fling the caret to the end
 */
export function groupOdometerInput(e: Event) {
  const el = e.currentTarget as HTMLInputElement;
  const caret = el.selectionStart ?? el.value.length;
  const sigBefore = el.value.slice(0, caret).replace(/[^0-9.]/g, '').length;
  const next = groupRaw(el.value);
  if (next === el.value) return;
  el.value = next;
  let seen = 0;
  let pos = next.length;
  for (let i = 0; i < next.length; i++) {
    if (/[0-9.]/.test(next[i])) seen++;
    if (seen >= sigBefore) {
      pos = i + 1;
      break;
    }
  }
  if (sigBefore === 0) pos = 0;
  el.setSelectionRange(pos, pos);
}
