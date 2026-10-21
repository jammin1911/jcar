import { goto, preloadData } from '$app/navigation';

// Eager preloading with a freshness probe.
//
// SvelteKit holds exactly one preloaded page at a time (a second
// preload discards the first), so the app preloads the two routes
// that carry its traffic: the Fuel-Up form from the dashboard, since
// that is the most used page in the app, and the dashboard itself
// from everywhere else, since every task ends back there. Once a
// page settles its one destination is preloaded in the background.
// A tap on one
// of those links then paints with no fetch at all, but only after a
// probe proves the preload is still current. The probe returns the
// data versions the preload was stamped with at load time (the
// counters in src/lib/server/versions.ts, bumped by every write in
// the same transaction as the write). Equal means nothing anywhere
// in the users data changed since the preload, so it is exactly as
// fresh as a fetch would be. Anything else, a changed version, a
// different selected vehicle, a probe that fails or times out,
// throws the preload away and the tap fetches fresh like it always
// did. Doubt always resolves to a refetch.

interface Stamp {
  v: string;
  sel: number | null;
}

const held = new Map<string, Stamp>();
let armSeq = 0;
let guardInstalled = false;

interface ProbeBody {
  v: { user: number; vehicles: Record<string, number> };
  sel: number | null;
}

function canon(body: ProbeBody): Stamp {
  const entries = Object.entries(body.v.vehicles).sort(([a], [b]) => Number(a) - Number(b));
  return { v: `${body.v.user}|${entries.map(([k, n]) => `${k}:${n}`).join(',')}`, sel: body.sel ?? null };
}

async function probe(): Promise<Stamp | null> {
  try {
    const res = await fetch('/api/data-version', {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(2500)
    });
    if (!res.ok) return null;
    return canon((await res.json()) as ProbeBody);
  } catch {
    return null;
  }
}

/** Preload the base destinations for the page the user is on now. */
export function armEagerPreload(pathname: string): void {
  const seq = ++armSeq;
  held.clear();
  const targets = [pathname === '/' ? '/fuel-up' : '/'];
  setTimeout(async () => {
    if (seq !== armSeq) return;
    const stamp = await probe();
    if (!stamp || seq !== armSeq) return;
    await Promise.allSettled(
      targets.map(async (t) => {
        const r = await preloadData(t);
        if (r.type === 'loaded' && seq === armSeq) held.set(t, stamp);
      })
    );
  }, 400);
}

/** One capture-phase click listener that guards taps on preloaded links. */
export function installPreloadGuard(): void {
  if (guardInstalled) return;
  guardInstalled = true;
  document.addEventListener(
    'click',
    (e) => {
      if (!held.size || e.defaultPrevented) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null | undefined;
      if (!a || a.hasAttribute('download')) return;
      if (a.target && a.target !== '_self') return;
      const url = new URL(a.href);
      if (url.origin !== location.origin) return;
      const stamp = held.get(url.pathname);
      if (!stamp) return;
      e.preventDefault();
      e.stopPropagation();
      const dest = url.pathname + url.search + url.hash;
      void (async () => {
        const now = await probe();
        if (now && now.v === stamp.v && now.sel === stamp.sel) {
          await goto(dest);
        } else {
          await goto(dest, { invalidateAll: true });
        }
      })();
    },
    true
  );
}
