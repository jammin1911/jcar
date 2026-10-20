import { randomUUID } from 'node:crypto';
import type { ScanResult } from './importFormats';

/**
 * Short lived stash for a scanned import file. The scan parses and
 * validates the upload and shows a summary, the parsed data waits
 * here tied to the user until they hit Import Now or Cancel (10
 * minutes). Nothing gets written to the database at scan time.
 */
export interface ScanJob {
  userId: number;
  scan: ScanResult;
  createdAt: number;
}

const TTL_MS = 10 * 60 * 1000;
const jobs = new Map<string, ScanJob>();

function sweep() {
  const now = Date.now();
  for (const [k, j] of jobs) {
    if (now - j.createdAt > TTL_MS) jobs.delete(k);
  }
}

export function createScanJob(userId: number, scan: ScanResult): string {
  sweep();
  const id = randomUUID();
  jobs.set(id, { userId, scan, createdAt: Date.now() });
  return id;
}

export function getScanJob(id: string, userId: number): ScanJob | null {
  sweep();
  const j = jobs.get(id);
  if (!j || j.userId !== userId) return null;
  return j;
}

export function deleteScanJob(id: string): void {
  jobs.delete(id);
}
