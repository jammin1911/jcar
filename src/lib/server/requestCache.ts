import { AsyncLocalStorage } from 'node:async_hooks';

// Per-request memo for the lookups every page repeats (the users
// vehicles, their settings, their plan). hooks.server.ts opens the
// store for each request and it dies with the request, so a memo hit
// can never serve anything older than the start of the request the
// user is looking at. The write paths never read back through these
// helpers after writing inside the same request, they read first and
// write after, so a write is never hidden by its own request either.
const als = new AsyncLocalStorage<Map<string, Promise<unknown>>>();

export function runWithRequestCache<T>(fn: () => T): T {
  return als.run(new Map(), fn);
}

export function memo<T>(key: string, make: () => Promise<T>): Promise<T> {
  const store = als.getStore();
  if (!store) return make();
  const hit = store.get(key) as Promise<T> | undefined;
  if (hit) return hit;
  const p = make();
  store.set(key, p);
  return p;
}
