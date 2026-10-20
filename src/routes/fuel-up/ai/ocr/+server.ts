import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { aiConfigured, ocrImage } from '$lib/server/aiFill';
import { createAiJob } from '$lib/server/aiJobs';
import { MAX_PHOTO_BYTES } from '$lib/server/photos';
import { DEMO_MODE, AI_DEMO_MESSAGE } from '$lib/server/demo';
import { aiBlocked } from '$lib/server/plans';

// Staged AI Auto Fill, step 1 (OCR) for the progress UI. The one-shot
// form action on /fuel-up/ai remains as the no-JS fallback.
export const POST: RequestHandler = async ({ request, locals }) => {
  const user = locals.user!;
  if (DEMO_MODE) {
    return json({ error: AI_DEMO_MESSAGE }, { status: 403 });
  }
  if (await aiBlocked(user.id)) {
    return json({ error: 'AI Auto Fill is a Paid plan feature.' }, { status: 403 });
  }
  if (!aiConfigured()) {
    return json({ error: 'AI Auto Fill is not set up yet - the AI endpoint is not configured on this server.' }, { status: 503 });
  }
  const data = await request.formData();
  const file = data.get('receipt');
  if (!(file instanceof File) || file.size === 0) {
    return json({ error: 'Attach a photo first.' }, { status: 400 });
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return json({ error: 'That photo is too large.' }, { status: 400 });
  }
  let texts: string[];
  try {
    texts = await ocrImage(Buffer.from(await file.arrayBuffer()));
  } catch {
    return json({ error: 'That file could not be read as an image.' }, { status: 400 });
  }
  const joinedText = texts.join('\n--- second read ---\n');
  // Sparse OCR text no longer fails the flow: a fuel pump photo has
  // almost no OCR-readable text, and the vision fallback (which gets
  // the photo itself) is the step that reads it. The job is created
  // either way and the later phases decide.
  const jobId = createAiJob(user.id, texts);
  return json({ jobId, ocrText: joinedText });
};
