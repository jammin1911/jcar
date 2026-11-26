import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSelectedVehicle } from '$lib/server/vehicles';
import { aiConfigured, aiErrorMessage } from '$lib/server/aiFill';
import { aiBlocked } from '$lib/server/plans';
import { DEMO_MODE, AI_DEMO_MESSAGE } from '$lib/server/demo';
import { createReminderJob, fetchSuggestions, missingSpecs } from '$lib/server/remindersAi';

// The staged path for the AI page: the browser posts here, shows
// progress while the model thinks, then follows the job id to the
// summary page. Same gates as the no-JS form action.
export const POST: RequestHandler = async ({ locals, cookies }) => {
  const user = locals.user!;
  if (DEMO_MODE) return json({ error: AI_DEMO_MESSAGE }, { status: 403 });
  if (await aiBlocked(user.id)) return json({ error: 'AI Auto Fill is a Paid plan feature.' }, { status: 403 });
  if (!aiConfigured()) {
    return json({ error: 'AI Auto Fill is not set up yet - the AI endpoint is not configured on this server.' }, { status: 503 });
  }
  const access = await getSelectedVehicle(cookies, user.id);
  if (!access) return json({ error: 'Pick a vehicle first.' }, { status: 400 });
  if (missingSpecs(access.vehicle).length > 0) {
    return json({ error: 'Fill in the vehicle specs first, then the AI has what it needs.' }, { status: 400 });
  }
  try {
    const suggestions = await fetchSuggestions(access.vehicle);
    const jobId = createReminderJob(user.id, access.vehicle.id, suggestions);
    return json({ jobId });
  } catch (e) {
    return json({ error: aiErrorMessage(e) }, { status: 502 });
  }
};
