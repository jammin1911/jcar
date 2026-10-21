import { promises as fs } from 'node:fs';
import path from 'node:path';
import { eq, inArray } from 'drizzle-orm';
import sharp from 'sharp';
import { db, recordPhotos, records, DB_PATH } from './db';
import type { Exec } from './versions';

// Record photos. Originals are never stored, uploads get re-encoded
// with sharp (EXIF rotated, max 1600px, JPEG with a quality step down
// aiming at about 100 KB) and kept as flat "<photoId>.jpg" files in
// <data>/photos. That dir is a bind mount, so photos survive deploys
// and never travel in deploy tarballs.

export const MAX_PHOTO_BYTES = (() => {
  const n = Number(process.env.MAX_PHOTO_BYTES);
  return Number.isFinite(n) && n > 0 ? n : 20 * 1024 * 1024;
})();

export const MAX_PHOTOS_PER_SUBMIT = 10;
const TARGET_BYTES = 130 * 1024;
const PHOTOS_DIR = path.join(path.dirname(DB_PATH), 'photos');

export function extractPhotoFiles(data: FormData): File[] {
  return data
    .getAll('photos')
    .filter((f): f is File => f instanceof File && f.size > 0);
}

/** Cheap pre-checks (count + the MAX_PHOTO_BYTES limit). Returns an error message or null. */
export function checkPhotoSizes(files: File[]): string | null {
  if (files.length > MAX_PHOTOS_PER_SUBMIT) {
    return `Too many photos - attach at most ${MAX_PHOTOS_PER_SUBMIT} at a time.`;
  }
  const limitMb = Math.round(MAX_PHOTO_BYTES / (1024 * 1024));
  for (const f of files) {
    if (f.size > MAX_PHOTO_BYTES) {
      return `Photo "${f.name}" is ${(f.size / (1024 * 1024)).toFixed(1)} MB - the limit is ${limitMb} MB per photo.`;
    }
  }
  return null;
}

const ATTEMPTS: { width: number; quality: number }[] = [
  { width: 1600, quality: 82 },
  { width: 1600, quality: 68 },
  { width: 1600, quality: 54 },
  { width: 1280, quality: 60 },
  { width: 1280, quality: 46 },
  { width: 1024, quality: 46 }
];

const RASTER_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'avif', 'heif', 'tiff']);

/**
 * Re-encode one uploaded image to a small JPEG (~100 KB target). Throws when
 * the file is not a readable image.
 */
export async function processPhoto(buf: Buffer): Promise<Buffer> {
  const meta = await sharp(buf).metadata();
  if (!meta.format || !RASTER_FORMATS.has(meta.format)) {
    throw new Error('unsupported image format');
  }
  let last: Buffer | null = null;
  for (const a of ATTEMPTS) {
    last = await sharp(buf)
      .rotate() // honour EXIF orientation
      .resize({ width: a.width, height: a.width, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: a.quality, mozjpeg: true })
      .toBuffer();
    if (last.length <= TARGET_BYTES) break;
  }
  return last!;
}

/** Process all uploads up front, before the record is saved, so a
 *  bad image fails the whole submit cleanly. */
export async function processPhotoBuffers(
  files: File[]
): Promise<{ buffers: Buffer[] } | { error: string }> {
  const buffers: Buffer[] = [];
  for (const f of files) {
    try {
      buffers.push(await processPhoto(Buffer.from(await f.arrayBuffer())));
    } catch {
      return { error: `Photo "${f.name}" could not be read as an image.` };
    }
  }
  return { buffers };
}

/** Persist processed images for a record (rows first so the id names the file). */
export async function storePhotos(recordId: number, buffers: Buffer[], exec: Exec = db): Promise<void> {
  if (!buffers.length) return;
  await fs.mkdir(PHOTOS_DIR, { recursive: true });
  for (const buf of buffers) {
    const rows = await exec
      .insert(recordPhotos)
      .values({ recordId, filename: '', bytes: buf.length, createdAt: new Date().toISOString() })
      .returning({ id: recordPhotos.id });
    const id = rows[0].id;
    const filename = `${id}.jpg`;
    await fs.writeFile(path.join(PHOTOS_DIR, filename), buf);
    await exec.update(recordPhotos).set({ filename }).where(eq(recordPhotos.id, id));
  }
}

/** Save a processed feedback photo (flat file named by message id). */
export async function saveFeedbackPhoto(messageId: number, buf: Buffer): Promise<string> {
  await fs.mkdir(PHOTOS_DIR, { recursive: true });
  const filename = `feedback-${messageId}.jpg`;
  await fs.writeFile(path.join(PHOTOS_DIR, filename), buf);
  return filename;
}

export async function deleteFeedbackPhoto(filename: string | null | undefined): Promise<void> {
  if (filename) await fs.rm(path.join(PHOTOS_DIR, filename), { force: true });
}

export async function getRecordPhotos(recordId: number): Promise<{ id: number; bytes: number }[]> {
  const rows = await db
    .select({ id: recordPhotos.id, bytes: recordPhotos.bytes })
    .from(recordPhotos)
    .where(eq(recordPhotos.recordId, recordId))
    .orderBy(recordPhotos.id);
  return rows.map((r) => ({ id: r.id, bytes: r.bytes ?? 0 }));
}

export function photoPath(filename: string): string {
  return path.join(PHOTOS_DIR, filename);
}

export async function getPhotoRow(photoId: number) {
  const rows = await db.select().from(recordPhotos).where(eq(recordPhotos.id, photoId)).limit(1);
  return rows[0] ?? null;
}

export async function deletePhoto(photoId: number, exec: Exec = db): Promise<void> {
  const row = await getPhotoRow(photoId);
  if (!row) return;
  await exec.delete(recordPhotos).where(eq(recordPhotos.id, photoId));
  if (row.filename) await fs.rm(path.join(PHOTOS_DIR, row.filename), { force: true });
}

/** Remove every photo (rows + files) belonging to the given records. */
export async function purgePhotosForRecords(recordIds: number[], exec: Exec = db): Promise<void> {
  if (!recordIds.length) return;
  const rows = await exec
    .select()
    .from(recordPhotos)
    .where(inArray(recordPhotos.recordId, recordIds));
  for (const r of rows) {
    if (r.filename) await fs.rm(path.join(PHOTOS_DIR, r.filename), { force: true });
  }
  await exec.delete(recordPhotos).where(inArray(recordPhotos.recordId, recordIds));
}

export async function purgePhotosForVehicle(vehicleId: number, exec: Exec = db): Promise<void> {
  const rows = await exec.select({ id: records.id }).from(records).where(eq(records.vehicleId, vehicleId));
  await purgePhotosForRecords(rows.map((r) => r.id), exec);
}
