import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
  loadRecordPage,
  readRecordForm,
  insertRecord,
  updateRecord,
  getEditableRecord,
  validateRecordInput,
  failValues
} from '$lib/server/recordPage';
import { db } from '$lib/server/db';
import { bumpVehicle } from '$lib/server/versions';
import { extractPhotoFiles, checkPhotoSizes, processPhotoBuffers, storePhotos } from '$lib/server/photos';

export const load: PageServerLoad = async ({ locals, cookies, url }) => {
  const page = await loadRecordPage(locals, cookies, url, 'fuel');
  // AI Auto Fill lands here with ?ai=1&... - prefill the form for review.
  if (!url.searchParams.has('ai') || page.editing) return page;
  const g = (k: string) => url.searchParams.get(k) ?? '';
  const checkNote = url.searchParams.has('check')
    ? ' The total read from the receipt did not match volume x price, so the total shown was calculated instead - please double-check all three values.'
    : '';
  return {
    ...page,
    aiValues: {
      odometer: '',
      price: g('price'),
      volume: g('volume'),
      totalCost: g('total'),
      notes: '',
      partial: false,
      missed: false,
      datetime: g('datetime') || page.defaultDateTime
    },
    aiNote: `Filled in from your photo - check the values, add the odometer, then Save.${checkNote}`
  };
};

export const actions: Actions = {
  default: async ({ request, locals, cookies }) => {
    const user = locals.user!;
    const url = new URL(request.url);
    const page = await loadRecordPage(locals, cookies, url, 'fuel');
    const data = await request.formData();
    const input = readRecordForm(data, 'fuel');
    if (page.costTracking) input.odometer = null; // cost-tracking vehicle: odometer does not exist
    const editId = Number(url.searchParams.get('edit')) || 0;
    const photoFiles = extractPhotoFiles(data);
    const error =
      (await validateRecordInput(page.vehicleId, input, page.settings, editId)) ??
      checkPhotoSizes(photoFiles);
    if (error) return fail(400, { error, ...(await failValues(user.id, input)) });

    // Decode/re-encode uploads BEFORE saving anything, so a bad image
    // fails the whole submit with the form intact.
    const processed = await processPhotoBuffers(photoFiles);
    if ('error' in processed) {
      return fail(400, { error: processed.error, ...(await failValues(user.id, input)) });
    }

    if (editId) {
      const rec = await getEditableRecord(page.vehicleId, 'fuel', editId);
      if (!rec) return fail(404, { error: 'That record no longer exists.' });
    }
    // The write, its photos and the version bump land together, so a
    // version can never describe data that is not there yet (or miss
    // data that is).
    await db.transaction(async (tx) => {
      const id = editId || (await insertRecord(user.id, page.vehicleId, input, tx));
      if (editId) await updateRecord(editId, input, tx);
      await storePhotos(id, processed.buffers, tx);
      await bumpVehicle(tx, page.vehicleId);
    });
    throw redirect(303, '/');
  }
};
