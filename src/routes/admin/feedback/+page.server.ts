import type { Actions, PageServerLoad } from './$types';
import { desc, eq } from 'drizzle-orm';
import { db, feedbackMessages } from '$lib/server/db';
import { requireAdmin } from '$lib/server/admin';
import { deleteFeedbackPhoto } from '$lib/server/photos';
import { getSettings } from '$lib/server/vehicles';
import { fmtDateTime } from '$lib/format';

export const load: PageServerLoad = async ({ locals }) => {
  const admin = requireAdmin(locals);
  const settings = await getSettings(admin.id);
  const rows = await db
    .select()
    .from(feedbackMessages)
    .orderBy(desc(feedbackMessages.id))
    .limit(200);
  return {
    messages: rows.map((r) => ({
      id: r.id,
      email: r.email ?? '',
      message: r.message,
      isRead: r.isRead === 1,
      hasPhoto: r.photoPath != null,
      when: fmtDateTime(r.createdAt, settings)
    })),
    unread: rows.filter((r) => r.isRead !== 1).length
  };
};

export const actions: Actions = {
  markRead: async ({ locals, request }) => {
    requireAdmin(locals);
    const data = await request.formData();
    const id = Number(data.get('id'));
    if (id) await db.update(feedbackMessages).set({ isRead: 1 }).where(eq(feedbackMessages.id, id));
    return { ok: true };
  },
  markUnread: async ({ locals, request }) => {
    requireAdmin(locals);
    const data = await request.formData();
    const id = Number(data.get('id'));
    if (id) await db.update(feedbackMessages).set({ isRead: 0 }).where(eq(feedbackMessages.id, id));
    return { ok: true };
  },
  deleteMessage: async ({ locals, request }) => {
    requireAdmin(locals);
    const data = await request.formData();
    const id = Number(data.get('id'));
    if (id) {
      const rows = await db
        .select({ photoPath: feedbackMessages.photoPath })
        .from(feedbackMessages)
        .where(eq(feedbackMessages.id, id));
      await db.delete(feedbackMessages).where(eq(feedbackMessages.id, id));
      await deleteFeedbackPhoto(rows[0]?.photoPath);
    }
    return { ok: true };
  }
};
