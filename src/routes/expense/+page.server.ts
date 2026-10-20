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
import { extractPhotoFiles, checkPhotoSizes, processPhotoBuffers, storePhotos } from '$lib/server/photos';

export const load: PageServerLoad = async ({ locals, cookies, url }) => {
  return loadRecordPage(locals, cookies, url, 'expense');
};

export const actions: Actions = {
  default: async ({ request, locals, cookies }) => {
    const user = locals.user!;
    const url = new URL(request.url);
    const page = await loadRecordPage(locals, cookies, url, 'expense');
    const data = await request.formData();
    const input = readRecordForm(data, 'expense');
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

    let recordId = editId;
    if (editId) {
      const rec = await getEditableRecord(page.vehicleId, 'expense', editId);
      if (!rec) return fail(404, { error: 'That record no longer exists.' });
      await updateRecord(editId, input);
    } else {
      recordId = await insertRecord(user.id, page.vehicleId, input);
    }
    await storePhotos(recordId, processed.buffers);
    throw redirect(303, '/browse');
  }
};
