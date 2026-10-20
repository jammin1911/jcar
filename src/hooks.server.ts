import { redirect, type Handle } from '@sveltejs/kit';
import { initDb } from '$lib/server/db';
import { getSessionUser } from '$lib/server/auth';
import { DEMO_MODE, getDemoUser } from '$lib/server/demo';

const PUBLIC_PATHS = ['/login', '/register'];

export const handle: Handle = async ({ event, resolve }) => {
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
  // /beta is the public marketing page, skips both auth redirects
  if (path === '/beta' || path.startsWith('/beta/')) {
    return resolve(event);
  }
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'));
  if (!event.locals.user && !isPublic) {
    throw redirect(303, '/login');
  }
  if (event.locals.user && isPublic) {
    throw redirect(303, '/');
  }
  return resolve(event);
};
