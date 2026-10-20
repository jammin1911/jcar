import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { readFile } from 'node:fs/promises';
import { db, feedbackMessages } from '$lib/server/db';
import { requireAdmin } from '$lib/server/admin';
import { photoPath } from '$lib/server/photos';

// Serves a feedback photo, admins only.
export const GET: RequestHandler = async ({ locals, params }) => {
  requireAdmin(locals);
  const id = Number(params.id);
  if (!id) throw error(404, 'Not found');
  const rows = await db
    .select({ photoPath: feedbackMessages.photoPath })
    .from(feedbackMessages)
    .where(eq(feedbackMessages.id, id));
  const filename = rows[0]?.photoPath;
  if (!filename) throw error(404, 'Not found');
  let bytes: Buffer;
  try {
    bytes = await readFile(photoPath(filename));
  } catch {
    throw error(404, 'Not found');
  }
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'private, max-age=31536000, immutable'
    }
  });
};
