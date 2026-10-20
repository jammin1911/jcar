import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  parseReceiptTextOnce,
  regexExtract,
  validateAiFields,
  fieldsToFuelUpUrl,
  AiError,
  aiErrorMessage,
  type ReceiptFields
} from '$lib/server/aiFill';
import { getAiJob, deleteAiJob } from '$lib/server/aiJobs';
import { aiBlocked } from '$lib/server/plans';

// Staged AI Auto Fill, step 2 for the progress UI:
//  phase 'regex' - deterministic extraction only, answers aiNeeded
//    when no anchor holds.
//  phase 'ai' - one AI attempt, so the page can show each try in its
//    progress bar. A transient failure answers retryable with its
//    message, a config failure answers fatal so the page stops
//    instead of burning retries on a broken setup.
export const POST: RequestHandler = async ({ request, locals }) => {
  const user = locals.user!;
  const body = (await request.json().catch(() => null)) as { jobId?: string; phase?: string } | null;
  const job = body?.jobId ? getAiJob(body.jobId, user.id) : null;
  if (!job || !body?.jobId) {
    return json({ error: 'That reading session expired - please try again.' }, { status: 410 });
  }
  if (await aiBlocked(user.id)) {
    return json({ error: 'AI Auto Fill is a Paid plan feature.' }, { status: 403 });
  }
  const jobId = body.jobId;

  if (body.phase === 'regex') {
    const fields = regexExtract(job.texts);
    if (!fields) return json({ aiNeeded: true });
    const ext = fields as ReceiptFields & { verified?: boolean };
    deleteAiJob(jobId);
    return json({ location: fieldsToFuelUpUrl(fields, ext.verified === false) });
  }

  if (body.phase === 'ai') {
    let fields: ReceiptFields | null;
    try {
      fields = await parseReceiptTextOnce(job.texts);
    } catch (e) {
      if (e instanceof AiError && !e.retryable) {
        return json({ error: e.message, fatal: true }, { status: 502 });
      }
      // the job is kept so the client can retry the AI step
      return json({ retryable: true, error: aiErrorMessage(e) });
    }
    if (!fields) {
      deleteAiJob(jobId);
      return json(
        { error: 'The fuel details could not be found in that photo. You can still enter the fuel-up manually.' },
        { status: 422 }
      );
    }
    const validated = validateAiFields(fields);
    deleteAiJob(jobId);
    return json({ location: fieldsToFuelUpUrl(validated.fields, validated.checkFailed) });
  }

  return json({ error: 'Unknown phase.' }, { status: 400 });
};
