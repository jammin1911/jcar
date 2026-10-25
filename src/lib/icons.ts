// inline SVG icons as strings, dropped into markup with {@html}

const s = (inner: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="#37474f" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

// the current tile set paints with the --jc-icon-* colour variables
// from app.css so the same markup covers light and dark themes
const m = (inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" aria-hidden="true" focusable="false">${inner}</svg>`;

export const icons = {
  fuel: m(
    `<path d="M5.1 20.6V4.3c0-.8.6-1.4 1.4-1.4h6.1c.8 0 1.4.6 1.4 1.4v16.3" stroke="var(--jc-icon-amber)" fill="var(--jc-icon-amber-soft)"/><path d="M7.3 5.4h4.5v4H7.3z" stroke="var(--jc-icon-amber)" fill="var(--jc-icon-surface)"/><path d="M14 8.2l2.5 2.2v5.8a1.5 1.5 0 0 0 3 0V11l-2.1-2.2" stroke="var(--jc-icon-amber)"/><path d="M3.5 20.7h12" stroke="var(--jc-icon-amber)"/>`
  ),
  service: m(
    `<path d="M14.7 3.3a5.3 5.3 0 0 0-6.1 6.8L3.1 15.6a1.8 1.8 0 0 0 0 2.5l.8.8a1.8 1.8 0 0 0 2.5 0l5.5-5.5a5.3 5.3 0 0 0 6.8-6.1l-3.3 3.1-2.6-.8-.8-2.6z" fill="var(--jc-icon-slate-soft)" stroke="var(--jc-icon-slate)"/>`
  ),
  expense: m(
    `<rect x="2.7" y="6.1" width="18.6" height="11.8" rx="2.1" fill="var(--jc-icon-green-soft)" stroke="var(--jc-icon-green)"/><circle cx="12" cy="12" r="3.1" fill="var(--jc-icon-surface)" stroke="var(--jc-icon-green)"/><circle cx="5.7" cy="9.1" r=".75" fill="var(--jc-icon-green)" stroke="none"/><circle cx="18.3" cy="14.9" r=".75" fill="var(--jc-icon-green)" stroke="none"/>`
  ),
  purchased: s(
    `<circle cx="9" cy="20" r="1.7" fill="#37474f"/><circle cx="17" cy="20" r="1.7" fill="#37474f"/><path d="M2.5 3.5h2.2l2.5 11h10.4l2-8H6" fill="#4db6ac"/>`
  ),
  sold: m(
    `<path d="M3.4 3.4h8.2l8.7 8.7a1.9 1.9 0 0 1 0 2.7l-5.5 5.5a1.9 1.9 0 0 1-2.7 0l-8.7-8.7z" fill="var(--jc-icon-red-soft)" stroke="var(--jc-icon-red)"/><circle cx="8" cy="8" r="1.45" fill="var(--jc-icon-surface)" stroke="var(--jc-icon-red)"/>`
  ),
  browse: m(
    `<circle cx="12" cy="12" r="9" stroke="var(--jc-icon-blue)"/><ellipse cx="12" cy="12" rx="4.1" ry="9" stroke="var(--jc-icon-blue)"/><path d="M3.4 9.1h17.2M3.4 14.9h17.2" stroke="var(--jc-icon-blue)"/>`
  ),
  statistics: m(
    `<rect x="5.1" y="2.3" width="13.8" height="19.4" rx="2.3" fill="var(--jc-icon-slate-soft)" stroke="var(--jc-icon-slate)"/><rect x="7.8" y="5.1" width="8.4" height="3.7" rx=".7" fill="var(--jc-icon-display)" stroke="none"/><g fill="var(--jc-icon-slate)" stroke="none"><circle cx="8.3" cy="12" r=".8"/><circle cx="12" cy="12" r=".8"/><circle cx="15.7" cy="12" r=".8"/><circle cx="8.3" cy="15.4" r=".8"/><circle cx="12" cy="15.4" r=".8"/><circle cx="15.7" cy="15.4" r=".8"/><circle cx="8.3" cy="18.7" r=".8"/><circle cx="12" cy="18.7" r=".8"/><circle cx="15.7" cy="18.7" r=".8"/></g>`
  ),
  charts: m(
    `<path d="M4.2 4.1v15.8h15.6" stroke="var(--jc-icon-slate)"/><rect x="7" y="12.4" width="2.8" height="5.3" rx=".55" fill="var(--jc-icon-blue)" stroke="none"/><rect x="11.2" y="9.5" width="2.8" height="8.2" rx=".55" fill="var(--jc-icon-teal)" stroke="none"/><rect x="15.4" y="6.3" width="2.8" height="11.4" rx=".55" fill="var(--jc-icon-purple)" stroke="none"/>`
  ),
  vehicleDetails: m(
    `<g stroke="var(--jc-icon-blue)" stroke-width="1.7"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2" fill="var(--jc-icon-surface)"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2" fill="var(--jc-icon-surface)"/></g>`
  ),
  predictions: m(
    `<circle cx="12" cy="9.1" r="6.2" stroke="var(--jc-icon-blue)"/><path d="M8.9 14.5a7.9 7.9 0 0 0 6.2 0" stroke="var(--jc-icon-blue)"/><path d="M9 16.1h6l1.1 3.4H7.9z" fill="var(--jc-icon-orange-soft)" stroke="var(--jc-icon-orange)"/><path d="M6.7 20.1h10.6" stroke="var(--jc-icon-orange)"/><path d="M14.8 5.7l.6 1.1 1.2.2-1 .8.2 1.2-1-.6-1 .6.2-1.2-1-.8 1.2-.2z" fill="var(--jc-icon-blue-soft)" stroke="none"/>`
  ),
  note: m(
    `<path d="M6 2.9h8.5l4 4v14.2H6z" fill="var(--jc-icon-amber-soft)" stroke="var(--jc-icon-amber)"/><path d="M14.5 2.9v4.3h4" fill="var(--jc-icon-surface)" stroke="var(--jc-icon-amber)"/><path d="M8.5 11.1h7.2M8.5 14.5h7.2M8.5 17.8h4.7" stroke="var(--jc-icon-amber)"/>`
  ),
  settings: m(
    `<path d="M10.2 2.7h3.6l.5 2.1c.7.2 1.3.4 1.8.8L18 4.5l2.5 2.5-1.1 1.9c.3.6.6 1.2.8 1.9l2.1.5v3.6l-2.1.5c-.2.7-.5 1.3-.8 1.9l1.1 1.9-2.5 2.5-1.9-1.1c-.6.3-1.2.6-1.9.8l-.5 2.1h-3.6l-.5-2.1c-.7-.2-1.3-.5-1.9-.8l-1.9 1.1-2.5-2.5 1.1-1.9c-.3-.6-.6-1.2-.8-1.9l-2.1-.5v-3.6l2.1-.5c.2-.7.5-1.3.8-1.9L3.4 7l2.5-2.5 1.9 1.1c.6-.3 1.2-.6 1.9-.8z" transform="translate(1.2 0) scale(.9)" fill="var(--jc-icon-slate-soft)" stroke="var(--jc-icon-slate)"/><circle cx="12" cy="12" r="3.1" fill="var(--jc-icon-surface)" stroke="var(--jc-icon-slate)"/>`
  ),
  importExport: m(
    `<path d="M3.5 7.3h13.1M13.1 3.8l3.5 3.5-3.5 3.5" stroke="var(--jc-icon-blue)" stroke-width="2"/><path d="M20.5 16.7H7.4M10.9 13.2l-3.5 3.5 3.5 3.5" stroke="var(--jc-icon-purple)" stroke-width="2"/>`
  ),
  sharing: m(
    `<path d="M8.5 10.6 14.7 7.3M8.5 13.4l6.2 3.3" stroke="var(--jc-icon-blue)"/><circle cx="5.9" cy="12" r="2.6" fill="var(--jc-icon-surface)" stroke="var(--jc-icon-blue)"/><circle cx="17.4" cy="5.9" r="2.6" fill="var(--jc-icon-surface)" stroke="var(--jc-icon-blue)"/><circle cx="17.4" cy="18.1" r="2.6" fill="var(--jc-icon-surface)" stroke="var(--jc-icon-blue)"/>`
  ),
  car: s(
    `<path d="M4 15.5 5.6 9.8A2 2 0 0 1 7.5 8.4h9a2 2 0 0 1 1.9 1.4L20 15.5v4h-2.6v-1.7H6.6v1.7H4v-4z" fill="#b39ddb" stroke="#4527a0"/><circle cx="8" cy="15.3" r="1.5" fill="#ede7f6" stroke="#4527a0"/><circle cx="16" cy="15.3" r="1.5" fill="#ede7f6" stroke="#4527a0"/>`
  )
};

export const pumpIcon = icons.fuel;

export const floppyIcon = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 4h12.5L20 7.5V20H4z" fill="#ef5350" stroke="#b71c1c" stroke-width="1.3"/><rect x="7.5" y="4.5" width="8" height="5" fill="#eceff1"/><rect x="7" y="12" width="10" height="8" fill="#eceff1"/></svg>`;

export const dotsIcon = `<svg viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>`;


export const plusCircleIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="#616161" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/></svg>`;

export const pinIcon = `<svg viewBox="0 0 24 24" fill="#ef5350" aria-hidden="true" style="width:26px;height:26px"><path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>`;

export const filterIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M3 5h18l-6.8 7.8V19l-4.4 2v-8.2L3 5z"/></svg>`;

// the tile icons theme themselves through the --jc-icon-* variables
// now so no dark overrides are needed here, the export stays because
// the dashboard and browse pages still merge it over icons
export const iconsDark: Partial<Record<keyof typeof icons, string>> = {};
