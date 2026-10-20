import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  aiConfigured,
  parsePhotoVisionOnce,
  validateAiFields,
  fieldsToFuelUpUrl,
  AiError,
  aiErrorMessage
} from '$lib/server/aiFill';
import { MAX_PHOTO_BYTES } from '$lib/server/photos';
import { DEMO_MODE, AI_DEMO_MESSAGE } from '$lib/server/demo';
import { aiBlocked } from '$lib/server/plans';

// Staged AI Auto Fill, the final fallback: the photo itself goes to
// the model (pump displays, and receipts the OCR paths could not
// read). One attempt per call, same as the parse endpoint. A
// transient failure answers retryable with its message, a config
// failure answers fatal so the page stops right away, no usable
// fields answers 422, success answers the prefill location.
export const POST: RequestHandler = async ({ request, locals }) => {
  if (DEMO_MODE) {
    return json({ error: AI_DEMO_MESSAGE }, { status: 403 });
  }
  if (await aiBlocked(locals.user!.id)) {
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
  let fields;
  try {
    fields = await parsePhotoVisionOnce(Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    if (e instanceof AiError && !e.retryable) {
      return json({ error: e.message, fatal: true }, { status: 502 });
    }
    return json({ retryable: true, error: aiErrorMessage(e) });
  }
  if (!fields) {
    return json(
      { error: 'The fuel details could not be found in that photo. You can still enter the fuel-up manually.' },
      { status: 422 }
    );
  }
  const validated = validateAiFields(fields);
  return json({ location: fieldsToFuelUpUrl(validated.fields, validated.checkFailed) });
};
