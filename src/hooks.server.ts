import { redirect, type Handle } from '@sveltejs/kit';
import { initDb } from '$lib/server/db';
import { getSessionUser } from '$lib/server/auth';
import { DEMO_MODE, getDemoUser } from '$lib/server/demo';
import { plansEnabled } from '$lib/server/plans';
import { runWithRequestCache } from '$lib/server/requestCache';

const PUBLIC_PATHS = ['/login', '/register'];

export const handle: Handle = (input) => runWithRequestCache(() => handleRequest(input));

const handleRequest: Handle = async ({ event, resolve }) => {
  await initDb();

  // Demo deployment (DEMO_MODE=1): no login at all - every visitor is
  // the built-in demo account, and the auth pages bounce home.
  if (DEMO_MODE) {
    event.locals.user = await getDemoUser();
    const path = event.url.pathname;
    if (PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'))) {
      throw redirect(303, '/');
    }
    return resolve(event);
  }

  event.locals.user = await getSessionUser(event.cookies);

  const path = event.url.pathname;
  // Public pages that skip both auth redirects. /landing is the
  // optional marketing route an install can provide, the rest are
  // its policy pages. None of them exist on a plain install, where
  // these paths just behave like any other missing page.
  if (
    path === '/landing' ||
    path === '/privacy' ||
    path === '/fair-use' ||
    path === '/terms'
  ) {
    return resolve(event);
  }
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'));
  if (!event.locals.user && !isPublic) {
    // Signed-out visitors to the root get the marketing page when
    // this install has one and plans are enabled. The landing HTML
    // is served at / itself, fetched from the internal route, and
    // any failure (no landing route, plans off) falls through to
    // the usual sign-in redirect.
    if (path === '/' && event.request.method === 'GET' && plansEnabled()) {
      const landing = await event.fetch('/landing', {
        headers: { 'x-jcar-landing': '1' }
      }).catch(() => null);
      if (landing && landing.ok) return landing;
    }
    throw redirect(303, '/login');
  }
  if (event.locals.user && isPublic) {
    throw redirect(303, '/');
  }
  return resolve(event);
};
