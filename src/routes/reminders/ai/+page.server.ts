import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getSelectedVehicle } from '$lib/server/vehicles';
import { aiConfigured, aiErrorMessage } from '$lib/server/aiFill';
import { aiBlocked } from '$lib/server/plans';
import { DEMO_MODE, AI_DEMO_MESSAGE } from '$lib/server/demo';
import { createReminderJob, fetchSuggestions, missingSpecs } from '$lib/server/remindersAi';

// AI Auto Fill for reminders: gates first (demo, plan, setup, specs),
// then the call. The no-JS path runs the call in the form action and
// lands on the summary, the JS path goes through the run endpoint
// and shows progress while it waits.
export const load: PageServerLoad = async ({ locals, cookies }) => {
  const user = locals.user!;
  const access = await getSelectedVehicle(cookies, user.id);
  if (!access) throw redirect(303, '/');
  const vehicle = access.vehicle;
  const missing = missingSpecs(vehicle);
  return {
    vehicle: { id: vehicle.id, name: vehicle.name },
    demo: DEMO_MODE,
    configured: aiConfigured(),
    planBlocked: await aiBlocked(user.id),
    missing,
    editHref: `/vehicle/new?edit=${vehicle.id}`
  };
};

export const actions: Actions = {
  default: async ({ locals, cookies }) => {
    const user = locals.user!;
    if (DEMO_MODE) return fail(403, { error: AI_DEMO_MESSAGE });
    if (await aiBlocked(user.id)) return fail(403, { error: 'AI Auto Fill is a Paid plan feature.' });
    if (!aiConfigured()) {
      return fail(503, { error: 'AI Auto Fill is not set up yet - the AI endpoint is not configured on this server.' });
    }
    const access = await getSelectedVehicle(cookies, user.id);
    if (!access) throw redirect(303, '/');
    if (missingSpecs(access.vehicle).length > 0) {
      return fail(400, { error: 'Fill in the vehicle specs first, then the AI has what it needs.' });
    }
    let jobId: string;
    try {
      const suggestions = await fetchSuggestions(access.vehicle);
      jobId = createReminderJob(user.id, access.vehicle.id, suggestions);
    } catch (e) {
      return fail(400, { error: aiErrorMessage(e) });
    }
    throw redirect(303, `/reminders/ai/summary?job=${jobId}`);
  }
};
