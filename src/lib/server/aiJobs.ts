import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// In-memory staging for the AI Auto Fill progress flow: the OCR step
// stores its reads under a job id, and the parse steps pick them up.
// Single container, short-lived (10 min) - memory is the right store.
// ---------------------------------------------------------------------------

interface AiJob {
  userId: number;
  texts: string[];
  createdAt: number;
}

const jobs = new Map<string, AiJob>();
const TTL_MS = 10 * 60 * 1000;

export function createAiJob(userId: number, texts: string[]): string {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > TTL_MS) jobs.delete(id);
  }
  const id = randomUUID();
  jobs.set(id, { userId, texts, createdAt: now });
  return id;
}

export function getAiJob(id: string, userId: number): AiJob | null {
  const job = jobs.get(id);
  if (!job || job.userId !== userId) return null;
  if (Date.now() - job.createdAt > TTL_MS) {
    jobs.delete(id);
    return null;
  }
  return job;
}

export function deleteAiJob(id: string): void {
  jobs.delete(id);
}
