import { randomUUID } from 'node:crypto';
import { AiError } from './aiFill';
import { REMINDER_ITEMS } from './reminders';
import type { VehicleRow } from './vehicles';

// AI Auto Fill for reminders: the vehicles specs go to the AI
// endpoint, the manufacturer service intervals come back as a draft.
// Nothing is saved here, the summary page shows the draft and only
// the users confirmation creates reminders. The model is named in
// the request on purpose, picked from a scored comparison run, the
// receipt Auto Fill model setting is a separate thing and stays
// untouched.

export const REMINDERS_MODEL = 'openai/gpt-6.2-sol';

export interface AiSuggestion {
  key: string;
  name: string;
  km: number | null;
  months: number | null;
  /** 'lifetime' or 'monitor' when the maker sets no interval */
  special: 'lifetime' | 'monitor' | null;
  /** false when the model had no answer for the item */
  suggested: boolean;
}

/** The spec fields the prompt needs, with the labels the user sees. */
const SPEC_FIELDS: { key: 'year' | 'make' | 'model' | 'submodel' | 'engine' | 'transmission' | 'driveType'; label: string }[] = [
  { key: 'year', label: 'Year' },
  { key: 'make', label: 'Make' },
  { key: 'model', label: 'Model' },
  { key: 'submodel', label: 'Trim' },
  { key: 'engine', label: 'Engine' },
  { key: 'transmission', label: 'Transmission' },
  { key: 'driveType', label: 'Drive Type' }
];

/** Labels of the spec fields still blank on the vehicle. */
export function missingSpecs(vehicle: VehicleRow): string[] {
  return SPEC_FIELDS.filter((f) => !(vehicle[f.key] ?? '').trim()).map((f) => f.label);
}

const SYSTEM_PROMPT =
  'You are a vehicle maintenance data assistant for a vehicle tracking app. You provide manufacturer recommended service intervals for a specific vehicle so the app can prefill maintenance reminders. Accuracy matters more than completeness: if you do not know the manufacturer interval for an item on this exact vehicle, return null for it instead of guessing.';

function userPrompt(vehicle: VehicleRow): string {
  return `Vehicle:
- Year: ${vehicle.year}
- Make: ${vehicle.make}
- Model: ${vehicle.model}
- Trim: ${vehicle.submodel}
- Engine: ${vehicle.engine}
- Transmission: ${vehicle.transmission}
- Drivetrain: ${vehicle.driveType}
- Driving conditions: normal (manufacturer normal schedule, not severe)

Return the manufacturer recommended service interval for each of these items, for this exact vehicle:
${REMINDER_ITEMS.map((i) => i.key).join(', ')}

Rules:
- Each value is either: an object {"km": <number or null>, "months": <number or null>} with the interval in kilometres and months (include whichever the manufacturer specifies, null for the other), the string "lifetime" if the manufacturer specifies no scheduled replacement, the string "monitor" if the vehicle system decides, or null if the item does not apply or you do not know the interval for this exact vehicle.
- Use kilometres, not miles.
- Do not invent intervals. Returning null is better than a wrong number.
- Reply with ONLY a JSON object whose keys are exactly the ${REMINDER_ITEMS.length} item names above. No other text.`;
}

const AI_UNREACHABLE =
  'The AI service did not respond. Check that the endpoint in the server settings is right and the service is up, then try again.';

/** Ask the model for the vehicles service intervals. Throws an
 * AiError with a user friendly message on any failure. */
export async function fetchSuggestions(vehicle: VehicleRow): Promise<AiSuggestion[]> {
  const baseUrl = (process.env.AI_API_BASE_URL ?? '').replace(/\/+$/, '');
  const apiKey = process.env.AI_API_KEY || null;
  if (!baseUrl) throw new AiError('AI Auto Fill is not set up yet - the AI endpoint is not configured on this server.', false);
  const body = {
    model: REMINDERS_MODEL,
    temperature: 0,
    // the cap matters: with no max_tokens the endpoint reserves
    // credit for the models full output limit and refuses the call
    // when the key cannot cover that, even though the real answer
    // is small
    max_tokens: 8000,
    response_format: { type: 'json_object' },
    reasoning: { effort: 'medium' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt(vehicle) }
    ]
  };
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000)
    });
  } catch {
    throw new AiError(AI_UNREACHABLE, true);
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new AiError('The AI service rejected the API key. Check the key in the server settings and try again.', false);
    }
    if (res.status === 404) {
      throw new AiError(
        'The AI service answered but could not find that model or path. Check the endpoint in the server settings.',
        false
      );
    }
    if (res.status === 429) {
      throw new AiError('The AI service is rate limited right now. Wait a bit and try again.', true);
    }
    throw new AiError(`The AI service replied with an error (${res.status}). Try again in a bit.`, res.status >= 500);
  }
  const data = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
  const text = data?.choices?.[0]?.message?.content ?? '';
  return parseSuggestions(text);
}

/** Turn the models reply into checked suggestions. Anything that
 * does not match the expected shape reads as no suggestion, a bad
 * answer never reaches the summary page as numbers. */
export function parseSuggestions(text: string): AiSuggestion[] {
  let obj: Record<string, unknown> = {};
  try {
    const cleaned = text.replace(/```(?:json)?/g, '').trim();
    const parsed: unknown = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object') obj = parsed as Record<string, unknown>;
  } catch {
    obj = {};
  }
  const leg = (v: unknown, max: number): number | null => {
    if (typeof v !== 'number' || !isFinite(v) || v <= 0 || v > max) return null;
    return Math.round(v);
  };
  return REMINDER_ITEMS.map((item) => {
    const raw = obj[item.key];
    if (raw === 'lifetime' || raw === 'monitor') {
      return { key: item.key, name: item.name, km: null, months: null, special: raw, suggested: true };
    }
    if (raw && typeof raw === 'object') {
      const r = raw as { km?: unknown; months?: unknown };
      const km = leg(r.km, 1000000);
      const months = leg(r.months, 600);
      if (km != null || months != null) {
        return { key: item.key, name: item.name, km, months, special: null, suggested: true };
      }
    }
    return { key: item.key, name: item.name, km: null, months: null, special: null, suggested: false };
  });
}

// In-memory staging between the AI answer and the summary page,
// same pattern as the receipt flow: user bound, 10 minute life.

interface ReminderJob {
  userId: number;
  vehicleId: number;
  suggestions: AiSuggestion[];
  createdAt: number;
}

const jobs = new Map<string, ReminderJob>();
const TTL_MS = 10 * 60 * 1000;

export function createReminderJob(userId: number, vehicleId: number, suggestions: AiSuggestion[]): string {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > TTL_MS) jobs.delete(id);
  }
  const id = randomUUID();
  jobs.set(id, { userId, vehicleId, suggestions, createdAt: now });
  return id;
}

export function getReminderJob(id: string, userId: number): ReminderJob | null {
  const job = jobs.get(id);
  if (!job || job.userId !== userId) return null;
  if (Date.now() - job.createdAt > TTL_MS) {
    jobs.delete(id);
    return null;
  }
  return job;
}

export function deleteReminderJob(id: string): void {
  jobs.delete(id);
}
