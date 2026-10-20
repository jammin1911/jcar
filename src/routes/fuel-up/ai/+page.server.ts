import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getSelectedVehicle } from '$lib/server/vehicles';
import {
  aiConfigured,
  aiErrorMessage,
  ocrImage,
  parseReceiptText,
  parsePhotoVision,
  regexExtract,
  validateAiFields,
  fieldsToFuelUpUrl,
  type ReceiptFields
} from '$lib/server/aiFill';
import { MAX_PHOTO_BYTES } from '$lib/server/photos';
import { DEMO_MODE, AI_DEMO_MESSAGE } from '$lib/server/demo';
import { aiBlocked } from '$lib/server/plans';

// AI Auto Fill: attach a photo, local tesseract OCR, the AI endpoint
// parses what the regex could not, redirect to the form prefilled.
export const load: PageServerLoad = async ({ locals, cookies }) => {
  const user = locals.user!;
  const access = await getSelectedVehicle(cookies, user.id);
  if (!access) throw redirect(303, '/vehicle/new');
  return {
    vehicleName: access.vehicle.name,
    configured: DEMO_MODE ? true : aiConfigured(),
    planBlocked: await aiBlocked(user.id)
  };
};

export const actions: Actions = {
  default: async ({ request, locals }) => {
    if (DEMO_MODE) {
      return fail(403, { error: AI_DEMO_MESSAGE });
    }
    if (await aiBlocked(locals.user!.id)) {
      return fail(403, { error: 'AI Auto Fill is a Paid plan feature.' });
    }
    if (!aiConfigured()) {
      return fail(503, { error: 'AI Auto Fill is not set up yet - the AI endpoint is not configured on this server.' });
    }
    const data = await request.formData();
    const file = data.get('receipt');
    if (!(file instanceof File) || file.size === 0) {
      return fail(400, { error: 'Attach a photo of your receipt first.' });
    }
    if (file.size > MAX_PHOTO_BYTES) {
      return fail(400, { error: 'That photo is too large.' });
    }
    const buf = Buffer.from(await file.arrayBuffer());

    let texts: string[];
    try {
      texts = await ocrImage(buf);
    } catch {
      return fail(400, { error: 'That file could not be read as an image.' });
    }
    const joinedText = texts.join('\n--- second read ---\n');

    // Deterministic extraction first, pump receipts share a rigid
    // layout and the regex path is instant and immune to model
    // flakiness. The text AI is the fallback for layouts the regex
    // cannot anchor, and the vision pass (the photo itself to the
    // model) is the final fallback, it reads the pump photos whose
    // displays OCR cannot handle.
    let fields: ReceiptFields | null = regexExtract(texts);
    let checkFailed = false;
    if (fields) {
      const ext = fields as ReceiptFields & { verified?: boolean };
      checkFailed = ext.verified === false;
    } else {
      try {
        fields = await parseReceiptText(texts);
      } catch {
        fields = null; // fall through to vision before giving up
      }
      if (!fields) {
        try {
          fields = await parsePhotoVision(buf);
        } catch (e) {
          return fail(502, {
            error: aiErrorMessage(e),
            ocrText: joinedText
          });
        }
      }
      if (!fields) {
        return fail(422, {
          error: 'The fuel details could not be found in that photo. You can still enter the fuel-up manually.',
          ocrText: joinedText
        });
      }
      const validated = validateAiFields(fields);
      fields = validated.fields;
      checkFailed = validated.checkFailed;
    }
    throw redirect(303, fieldsToFuelUpUrl(fields, checkFailed));
  }
};
