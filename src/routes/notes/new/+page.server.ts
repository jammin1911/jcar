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
  return loadRecordPage(locals, cookies, url, 'note');
};

export const actions: Actions = {
  default: async ({ request, locals, cookies }) => {
    const user = locals.user!;
    const url = new URL(request.url);
    const page = await loadRecordPage(locals, cookies, url, 'note');
    const data = await request.formData();
    const input = readRecordForm(data, 'note');
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
      const rec = await getEditableRecord(page.vehicleId, 'note', editId);
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
    throw redirect(303, editId ? '/browse' : '/');
  }
};
