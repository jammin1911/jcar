import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { eq } from 'drizzle-orm';
import { db, feedbackMessages } from '$lib/server/db';
import { notifyNtfy } from '$lib/server/notify';
import { MAX_PHOTO_BYTES, processPhotoBuffers, saveFeedbackPhoto } from '$lib/server/photos';

export const load: PageServerLoad = async ({ locals }) => {
  return { email: locals.user!.username };
};

export const actions: Actions = {
  default: async ({ request, locals }) => {
    const user = locals.user!;
    const data = await request.formData();
    const message = String(data.get('message') ?? '').trim();
    if (message.length < 1) {
      return fail(400, { error: 'Please enter a message first.' });
    }
    if (message.length > 5000) {
      return fail(400, { error: 'That message is too long (max 5000 characters).' });
    }

    // Optional single photo, run through the same pipeline as record
    // photos before anything is saved, so a bad image fails cleanly.
    const file = data.get('photo');
    let photoBuf: Buffer | null = null;
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_PHOTO_BYTES) {
        return fail(400, { error: 'That photo is too large.' });
      }
      const processed = await processPhotoBuffers([file]);
      if ('error' in processed) {
        return fail(400, { error: processed.error });
      }
      photoBuf = processed.buffers[0];
    }

    const inserted = await db
      .insert(feedbackMessages)
      .values({
        userId: user.id,
        email: user.username,
        message,
        createdAt: new Date().toISOString()
      })
      .returning({ id: feedbackMessages.id });
    const messageId = inserted[0].id;

    if (photoBuf) {
      const filename = await saveFeedbackPhoto(messageId, photoBuf);
      await db.update(feedbackMessages).set({ photoPath: filename }).where(eq(feedbackMessages.id, messageId));
    }

    // Ping ntfy, fire and forget.
    void notifyNtfy(
      'jCar Feedback/Support',
      `New feedback from ${user.username}:\n\n${message}${photoBuf ? '\n\n(Photo attached - view it in Admin, Feedback/Support)' : ''}`,
      'speech_balloon'
    );

    return { sent: true };
  }
};
