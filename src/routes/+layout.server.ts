import type { LayoutServerLoad } from './$types';
import { getSettings } from '$lib/server/vehicles';

/**
 * Root layout data: the Umami analytics ids (from env, nothing gets
 * emitted when they are unset, and each deployment sets its own
 * website id so the stats stay separate) and the user's theme,
 * rendered server-side as data-theme so there is no flash of the
 * wrong theme on load.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
  const scriptUrl = process.env.UMAMI_SCRIPT_URL ?? '';
  const websiteId = process.env.UMAMI_WEBSITE_ID ?? '';
  const theme = locals.user ? (await getSettings(locals.user.id)).theme : 'light';
  return {
    umami: scriptUrl && websiteId ? { scriptUrl, websiteId } : null,
    theme
  };
};
