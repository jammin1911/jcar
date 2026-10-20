// inline SVG icons as strings, dropped into markup with {@html}

const s = (inner: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="#37474f" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

export const icons = {
  fuel: s(
    `<path fill-rule="evenodd" fill="#ffca28" stroke="#8d6e00" d="M5 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z M6.5 6h5v4.5h-5Z"/><path d="M14 9.5 17 12v5.5a1.6 1.6 0 0 0 3.2 0V11l-2.7-2.7" stroke="#8d6e00"/><path d="M2.5 21h13" stroke="#8d6e00"/>`
  ),
  service: s(
    `<path d="M14.9 6.1a4.2 4.2 0 0 0-5.7 5.2L3 17.5V21h3.5l6.2-6.2a4.2 4.2 0 0 0 5.2-5.7l-2.9 2.9-2.5-.8-.8-2.5 3.2-2.5z" fill="#90a4ae"/>`
  ),
  expense: s(
    `<path fill-rule="evenodd" fill="#66bb6a" stroke="#2e7d32" d="M4.5 6h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z M12 8.8a3.2 3.2 0 1 0 0.001 0Z"/><path d="M5.8 9.2h.01M18.2 14.8h.01" stroke="#2e7d32" stroke-width="2.2"/>`
  ),
  purchased: s(
    `<circle cx="9" cy="20" r="1.7" fill="#37474f"/><circle cx="17" cy="20" r="1.7" fill="#37474f"/><path d="M2.5 3.5h2.2l2.5 11h10.4l2-8H6" fill="#4db6ac"/>`
  ),
  sold: s(
    `<path d="M3.5 3.5H12L20.5 12a2 2 0 0 1 0 2.8l-5.7 5.7a2 2 0 0 1-2.8 0L3.5 12V3.5z" fill="#ef5350" stroke="#b71c1c"/><circle cx="8" cy="8" r="1.6" fill="#fff" stroke="#b71c1c"/>`
  ),
  browse: s(
    `<circle cx="12" cy="12" r="9" fill="none" stroke="#0277bd"/><ellipse cx="12" cy="12" rx="4.2" ry="9" fill="none" stroke="#0277bd"/><path d="M3.2 9.5h17.6M3.2 14.5h17.6" stroke="#0277bd"/>`
  ),
  statistics: s(
    `<rect x="5" y="2.5" width="14" height="19" rx="2" fill="#b0bec5"/><rect x="8" y="5.5" width="8" height="4" fill="#c8e6c9" stroke="none"/><path d="M8.2 13h.01M12 13h.01M15.8 13h.01M8.2 16.4h.01M12 16.4h.01M15.8 16.4h.01" stroke="#37474f" stroke-width="2.2"/>`
  ),
  charts: s(
    `<path d="M4 4v16h16" /><rect x="7" y="12" width="2.8" height="6" fill="#42a5f5" stroke="none"/><rect x="11.5" y="9" width="2.8" height="9" fill="#26a69a" stroke="none"/><rect x="16" y="6" width="2.8" height="12" fill="#7e57c2" stroke="none"/>`
  ),
  vehicleDetails: s(
    `<g stroke="#1565c0" stroke-width="1.7"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></g>`
  ),
  predictions: s(
    `<circle cx="12" cy="9.5" r="6.5" fill="none" stroke="#0277bd"/><path d="M9 15a8 8 0 0 0 6 0" stroke="#0277bd"/><path d="M8.5 16.5h7l1 4h-9z" fill="#ffa726" stroke="#e65100"/><path d="M6 20.5h12" stroke="#e65100"/>`
  ),
  note: s(
    `<path d="M6 3.5h9L19.5 8v12.5h-13.5z" fill="#fff176" stroke="#c0a000"/><path d="M15 3.5v4.5h4.5" fill="#ffee58" stroke="#c0a000"/><path d="M8.8 12h7.4M8.8 15h7.4M8.8 18h4.5" stroke="#8d6e00" stroke-width="1.3"/>`
  ),
  settings: s(
    `<g fill="#90a4ae" stroke="#37474f" stroke-width="1.1"><rect x="10.7" y="2.4" width="2.6" height="5" rx="1"/><rect x="10.7" y="2.4" width="2.6" height="5" rx="1" transform="rotate(45 12 12)"/><rect x="10.7" y="2.4" width="2.6" height="5" rx="1" transform="rotate(90 12 12)"/><rect x="10.7" y="2.4" width="2.6" height="5" rx="1" transform="rotate(135 12 12)"/><rect x="10.7" y="2.4" width="2.6" height="5" rx="1" transform="rotate(180 12 12)"/><rect x="10.7" y="2.4" width="2.6" height="5" rx="1" transform="rotate(225 12 12)"/><rect x="10.7" y="2.4" width="2.6" height="5" rx="1" transform="rotate(270 12 12)"/><rect x="10.7" y="2.4" width="2.6" height="5" rx="1" transform="rotate(315 12 12)"/><path fill-rule="evenodd" d="M12 5.7a6.3 6.3 0 1 0 0.001 0Z M12 9.3a2.7 2.7 0 1 0 0.001 0Z"/></g>`
  ),
  importExport: s(
    `<path d="M3.5 7.5h13M13 3.8l3.7 3.7-3.7 3.7" stroke="#3949ab" stroke-width="2.1"/><path d="M20.5 16.5h-13M11 12.8l-3.7 3.7 3.7 3.7" stroke="#3949ab" stroke-width="2.1"/>`
  ),
  sharing: s(
    `<path d="M8.6 10.6 14.9 7.3M8.6 13.4l6.3 3.3" stroke="#0277bd" stroke-width="1.7"/><circle cx="6" cy="12" r="3" fill="none" stroke="#0277bd"/><circle cx="17.5" cy="6" r="3" fill="none" stroke="#0277bd"/><circle cx="17.5" cy="18" r="3" fill="none" stroke="#0277bd"/>`
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

/**
 * dark versions of the brightest icons with muted fills so they do
 * not glare on the dark background, pages merge these over icons
 * when the theme is dark
 */
export const iconsDark: Partial<Record<keyof typeof icons, string>> = {
  fuel: s(
    `<path fill-rule="evenodd" fill="#d9a41f" stroke="#8d6e00" d="M5 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z M6.5 6h5v4.5h-5Z"/><path d="M14 9.5 17 12v5.5a1.6 1.6 0 0 0 3.2 0V11l-2.7-2.7" stroke="#8d6e00"/><path d="M2.5 21h13" stroke="#8d6e00"/>`
  ),
  expense: s(
    `<path fill-rule="evenodd" fill="#4a8f4e" stroke="#5da862" d="M4.5 6h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z M12 8.8a3.2 3.2 0 1 0 0.001 0Z"/><path d="M5.8 9.2h.01M18.2 14.8h.01" stroke="#5da862" stroke-width="2.2"/>`
  ),
  note: s(
    `<path d="M6 3.5h9L19.5 8v12.5h-13.5z" fill="#d3bc3f" stroke="#a8891c"/><path d="M15 3.5v4.5h4.5" fill="#c9ae35" stroke="#a8891c"/><path d="M8.8 12h7.4M8.8 15h7.4M8.8 18h4.5" stroke="#8d6e00" stroke-width="1.3"/>`
  ),
  statistics: s(
    `<rect x="5" y="2.5" width="14" height="19" rx="2" fill="#5d707b"/><rect x="8" y="5.5" width="8" height="4" fill="#7d9b80" stroke="none"/><path d="M8.2 13h.01M12 13h.01M15.8 13h.01M8.2 16.4h.01M12 16.4h.01M15.8 16.4h.01" stroke="#d3dde2" stroke-width="2.2"/>`
  ),
  predictions: s(
    `<circle cx="12" cy="9.5" r="6.5" fill="none" stroke="#5ea9dd"/><path d="M9 15a8 8 0 0 0 6 0" stroke="#5ea9dd"/><path d="M8.5 16.5h7l1 4h-9z" fill="#d98a2b" stroke="#e65100"/><path d="M6 20.5h12" stroke="#e65100"/>`
  ),
  browse: s(
    `<circle cx="12" cy="12" r="9" fill="none" stroke="#57a6dc"/><ellipse cx="12" cy="12" rx="4.2" ry="9" fill="none" stroke="#57a6dc"/><path d="M3.2 9.5h17.6M3.2 14.5h17.6" stroke="#57a6dc"/>`
  ),
  sharing: s(
    `<path d="M8.6 10.6 14.9 7.3M8.6 13.4l6.3 3.3" stroke="#57a6dc" stroke-width="1.7"/><circle cx="6" cy="12" r="3" fill="none" stroke="#57a6dc"/><circle cx="17.5" cy="6" r="3" fill="none" stroke="#57a6dc"/><circle cx="17.5" cy="18" r="3" fill="none" stroke="#57a6dc"/>`
  ),
  settings: s(
    `<g fill="#66757e" stroke="#9fb2bc" stroke-width="1.1"><rect x="10.7" y="2.4" width="2.6" height="5" rx="1"/><rect x="10.7" y="2.4" width="2.6" height="5" rx="1" transform="rotate(45 12 12)"/><rect x="10.7" y="2.4" width="2.6" height="5" rx="1" transform="rotate(90 12 12)"/><rect x="10.7" y="2.4" width="2.6" height="5" rx="1" transform="rotate(135 12 12)"/><rect x="10.7" y="2.4" width="2.6" height="5" rx="1" transform="rotate(180 12 12)"/><rect x="10.7" y="2.4" width="2.6" height="5" rx="1" transform="rotate(225 12 12)"/><rect x="10.7" y="2.4" width="2.6" height="5" rx="1" transform="rotate(270 12 12)"/><rect x="10.7" y="2.4" width="2.6" height="5" rx="1" transform="rotate(315 12 12)"/><path fill-rule="evenodd" d="M12 5.7a6.3 6.3 0 1 0 0.001 0Z M12 9.3a2.7 2.7 0 1 0 0.001 0Z"/></g>`
  ),
  sold: s(
    `<path d="M3.5 3.5H12L20.5 12a2 2 0 0 1 0 2.8l-5.7 5.7a2 2 0 0 1-2.8 0L3.5 12V3.5z" fill="#c14a47" stroke="#cf5f5f"/><circle cx="8" cy="8" r="1.6" fill="#e8dede" stroke="#cf5f5f"/>`
  )
};
