import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

// AI Auto Fill: the photo gets OCR'd locally with tesseract so the image
// never leaves the server, then just the text goes to the AI endpoint and
// gets parsed into the form fields. Nothing saves until the user looks
// the prefilled form over and hits save themselves.

const execFileAsync = promisify(execFile);

// The AI side talks to any OpenAI compatible endpoint. Base url, key and
// model id all come from env, there are no defaults baked in, an install
// either sets them or the feature stays off. The key is optional, local
// endpoints often do not want one.
// the model id can be anything the endpoint offers. in testing
// google/gemma-4-31b-it from openrouter was a good balance of
// low cost and accuracy
interface AiConfig {
  baseUrl: string;
  apiKey: string | null;
  model: string;
}

function aiConfig(): AiConfig | null {
  const baseUrl = (process.env.AI_API_BASE_URL ?? '').replace(/\/+$/, '');
  const model = process.env.AI_MODEL ?? '';
  if (!baseUrl || !model) return null;
  return { baseUrl, apiKey: process.env.AI_API_KEY || null, model };
}

export function aiConfigured(): boolean {
  return aiConfig() !== null;
}

/** An AI call failure with a message the user can act on. retryable
 * marks the transient ones (no answer, rate limited, server errors),
 * the rest are config problems that retrying will not fix. */
export class AiError extends Error {
  retryable: boolean;
  constructor(message: string, retryable: boolean) {
    super(message);
    this.retryable = retryable;
  }
}

const AI_UNREACHABLE =
  'The AI service did not respond. Check that the endpoint in the server settings is right and the service is up, then try again.';
const AI_GENERIC = 'Something went wrong while talking to the AI service. Try again, or just fill the form in by hand.';

/** The message to show the user for any AI failure. */
export function aiErrorMessage(e: unknown): string {
  return e instanceof AiError ? e.message : AI_GENERIC;
}

/** One chat completion call against the configured endpoint. Throws an
 * AiError with a user friendly message on any failure, returns the
 * reply text on success. */
async function callAi(cfg: AiConfig, messages: unknown, timeoutMs: number): Promise<string> {
  const body: Record<string, unknown> = { model: cfg.model, temperature: 0, messages };
  // the reasoning effort field is not part of the OpenAI spec, some
  // endpoints reject unknown fields outright, so it only goes out when
  // the install asks for it
  const effort = process.env.AI_REASONING_EFFORT;
  if (effort) body.reasoning = { effort };
  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {})
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs)
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
        'The AI service answered but could not find that model or path. Check the endpoint and model in the server settings.',
        false
      );
    }
    if (res.status === 429) {
      throw new AiError('The AI service is rate limited right now. Wait a bit and try again.', true);
    }
    throw new AiError(`The AI service replied with an error (${res.status}). Try again in a bit.`, res.status >= 500);
  }
  const data = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
  return data?.choices?.[0]?.message?.content ?? '';
}

async function runTesseract(png: Buffer, tag: string): Promise<string> {
  const tmp = path.join(
    tmpdir(),
    `jcar-ocr-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.png`
  );
  await writeFile(tmp, png);
  try {
    const { stdout } = await execFileAsync('tesseract', [tmp, 'stdout', '--psm', '6', '-l', 'eng'], {
      timeout: 60000,
      maxBuffer: 8 * 1024 * 1024
    });
    return stdout;
  } finally {
    await unlink(tmp).catch(() => {});
  }
}

/**
 * OCR a photo with the local tesseract binary, three reads with
 * different preprocessing (upscaled grayscale, upscaled thresholded,
 * native res grayscale). In testing each variant garbled different
 * digits, so the extractors reconcile a few reads instead of
 * trusting just one.
 */
export async function ocrImage(image: Buffer): Promise<string[]> {
  const upscaled = sharp(image)
    .rotate()
    .resize({ width: 3000, height: 3000, fit: 'inside' })
    .grayscale()
    .normalize();
  const native = sharp(image).rotate().grayscale().normalize();
  const [plain, thresholded, nativePng] = await Promise.all([
    upscaled.clone().png().toBuffer(),
    upscaled.clone().threshold(150).png().toBuffer(),
    native.png().toBuffer()
  ]);
  return Promise.all([
    runTesseract(plain, 'a'),
    runTesseract(thresholded, 'b'),
    runTesseract(nativePng, 'c')
  ]);
}

export interface ReceiptFields {
  /** local datetime for the form input: YYYY-MM-DDTHH:MM */
  datetime: string | null;
  /** litres */
  volume: number | null;
  /** dollars per litre */
  pricePerUnit: number | null;
  /** dollars */
  totalCost: number | null;
  station: string | null;
}

const SYSTEM_PROMPT = `You extract data from OCR reads of a Canadian fuel station receipt. You may receive multiple OCR reads of the SAME receipt - they disagree in places because OCR garbles digits (common confusions: 1/4/7, 0/6/8, 5/3). Reconcile them.
Return ONLY a JSON object with these keys (no markdown, no commentary):
- "datetime": the purchase date and time as "YYYY-MM-DDTHH:MM" (24-hour), or null. It must be a REAL calendar date and time - if the reads show impossible values (month 18, day 61, hour 64), fix the garbled digits.
- "volume": fuel volume in litres, a number, or null
- "pricePerUnit": price in DOLLARS per litre. Receipts often print the price in CENTS per litre (for example 172.9 means $1.729 per litre) - convert to dollars. Or null.
- "totalCost": total amount paid in dollars, a number, or null
- "station": the station brand/name, a string, or null
VALIDATION: volume x pricePerUnit must equal totalCost within 0.02. If your candidate values do not multiply out, re-check the digits across the reads and pick the combination that does. Use null for anything you cannot determine. Never invent values.`;

function posNum(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.replace(/[^0-9.]/g, '')) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Pull the first JSON object out of a model reply and coerce it to fields. */
export function coerceFields(reply: string): ReceiptFields | null {
  const start = reply.indexOf('{');
  const end = reply.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(reply.slice(start, end + 1));
  } catch {
    return null;
  }
  let dt: string | null = null;
  if (typeof obj.datetime === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(obj.datetime)) {
    const cand = obj.datetime.slice(0, 16);
    const d = new Date(cand);
    // Reject impossible datetimes the model let through (month 18, day 61...).
    if (
      !isNaN(d.getTime()) &&
      d.getFullYear() === Number(cand.slice(0, 4)) &&
      d.getMonth() + 1 === Number(cand.slice(5, 7)) &&
      d.getDate() === Number(cand.slice(8, 10)) &&
      d.getHours() === Number(cand.slice(11, 13)) &&
      d.getMinutes() === Number(cand.slice(14, 16))
    ) {
      dt = cand;
    }
  }
  const fields: ReceiptFields = {
    datetime: dt,
    volume: posNum(obj.volume),
    pricePerUnit: posNum(obj.pricePerUnit),
    totalCost: posNum(obj.totalCost),
    station: typeof obj.station === 'string' && obj.station.trim() ? obj.station.trim().slice(0, 60) : null
  };
  // A receipt with none of the money/volume fields is a failed parse.
  if (fields.volume == null && fields.totalCost == null && fields.pricePerUnit == null) return null;
  return fields;
}

export interface ExtractedReceipt extends ReceiptFields {
  /** true when an explicitly-read total confirmed volume x price */
  verified: boolean;
}

const uniq = (xs: number[]) => [...new Set(xs)];
const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Deterministic extraction from OCR text. Canadian pump receipts share
 * a rigid layout ("46.770L AT $1.829/L", the total printed a few
 * times), so this tries anchors, strongest first:
 *  1. The paired "VOLUME L AT $PRICE/L" line. The pair gets checked
 *     against the printed totals, volume x price has to equal one. If
 *     the price digit is garbled but a nearby total implies a price
 *     within 2 cents of the read one, the implied price wins.
 *  2. A volume from an "L AT" fragment plus the best scoring printed
 *     total (shows in both reads, most frequent), price derived.
 * Loose numbers elsewhere never get trusted on their own, in testing
 * first match kept picking confidently wrong triples out of the noise.
 * Returns null when no anchor holds, the caller falls back to the AI.
 */
export function regexExtract(ocrTexts: string[]): ExtractedReceipt | null {
  const text = ocrTexts.join('\n');
  const inBothReads = (needle: string) => ocrTexts.every((t) => t.includes(needle));

  let station: string | null = null;
  const stationMatch = text.match(
    /PETRO[\s-]*CANADA|CANADIAN TIRE|COSTCO|ESSO|SHELL|PIONEER|ULTRAMAR|IRVING|MOBIL|HUSKY|FAS GAS/i
  );
  if (stationMatch) {
    station = /PETRO/i.test(stationMatch[0]) ? 'PETRO-CANADA' : stationMatch[0].toUpperCase();
  }

  // ---- datetime: independent date and time candidates, each validated;
  // one invalid component may be repaired by a single digit-confusion
  // substitution when exactly one repair yields a valid value.
  const CONFUSE: Record<string, string[]> = {
    '0': ['6', '8'], '1': ['4', '7'], '2': ['7'], '3': ['5', '8'], '4': ['1', '9'],
    '5': ['3', '6', '8'], '6': ['0', '8'], '7': ['1', '2'], '8': ['0', '6'], '9': ['4', '8']
  };
  const repairs = (s: string): string[] => {
    const out: string[] = [];
    for (let i = 0; i < s.length; i++) {
      for (const alt of CONFUSE[s[i]] ?? []) out.push(s.slice(0, i) + alt + s.slice(i + 1));
    }
    return out;
  };
  const validDate = (y: number, mo: number, d: number) => {
    const dt = new Date(y, mo - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
  };
  const dateCands = [...text.matchAll(/(\d{4})-(\d{2})-(\d{2})/g)].map((m) => ({
    y: m[1], mo: m[2], d: m[3]
  }));
  // Repair ONLY the invalid component - repairing both explodes the
  // candidate set (a valid "04" minutes spawns "01"/"09" ghosts).
  const repairField = (s: string, ok: (n: number) => boolean): string | null => {
    if (ok(+s)) return s;
    const fixed = [...new Set(repairs(s))].filter((x) => ok(+x));
    return fixed.length === 1 ? fixed[0] : null;
  };
  // Majority voting across reads: a value most reads agree on beats a
  // single read's plausible garble (one read turned 10:47 into 18:47 -
  // valid as read, wrong in fact).
  const tally = (xs: string[]): string | null => {
    const counts = new Map<string, number>();
    for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };
  const dateVotes: string[] = [];
  for (const c of dateCands) {
    // Receipts are recent - a "9926" year is a garble, not a date.
    if (+c.y < 2015 || +c.y > 2030) continue;
    const mo = repairField(c.mo, (n) => n >= 1 && n <= 12);
    if (!mo) continue;
    const d = repairField(c.d, (n) => n >= 1 && n <= 31 && validDate(+c.y, +mo, n));
    if (d && validDate(+c.y, +mo, +d)) dateVotes.push(`${c.y}-${mo}-${d}`);
  }
  const datePart = tally(dateVotes);
  const timeVotes: string[] = [];
  const timeCands = [...text.matchAll(/(\d{2}):(\d{2}):(\d{2})/g)].map((m) => ({ h: m[1], mi: m[2] }));
  for (const c of timeCands) {
    const h = repairField(c.h, (n) => n <= 23);
    const mi = repairField(c.mi, (n) => n <= 59);
    if (h && mi) timeVotes.push(`${h}:${mi}`);
  }
  const timePart = tally(timeVotes);
  const datetime = datePart ? `${datePart}T${timePart ?? '12:00'}` : null;

  // ---- money candidates, scored by cross-read presence + frequency
  const amountFreq = new Map<number, number>();
  for (const m of text.matchAll(/\$\s*(\d{1,3}\.\d{2})(?!\d)/g)) {
    const a = parseFloat(m[1]);
    if (a >= 1 && a <= 600) amountFreq.set(a, (amountFreq.get(a) ?? 0) + 1);
  }
  const amountScore = (a: number) =>
    (inBothReads(`$${a.toFixed(2)}`) || inBothReads(`$ ${a.toFixed(2)}`) ? 100 : 0) +
    (amountFreq.get(a) ?? 0);

  // ---- anchor 1: paired "VOL L AT $PRICE/L" lines
  const pairFreq = new Map<string, { v: number; p: number; n: number }>();
  for (const m of text.matchAll(/(\d{1,3}\.\d{3})\s*L\s*(?:AT|@)\s*\$\s*(\d{1,2}\.\d{2,3})\s*\/\s*L/gi)) {
    const v = parseFloat(m[1]);
    const p = parseFloat(m[2]);
    if (v < 1 || v > 250 || p < 0.5 || p > 3.5) continue;
    const key = `${v}|${p}`;
    const cur = pairFreq.get(key) ?? { v, p, n: 0 };
    cur.n++;
    pairFreq.set(key, cur);
  }
  const pairs = [...pairFreq.values()].sort((a, b) => b.n - a.n);
  // Evaluate every pair and keep the best-scoring outcome:
  //  300 - a printed total EXACTLY equals volume x price (verified)
  //  200 - printed totals cluster far from the pair's product (> 25¢),
  //        so the pair's price digit is garbled; repair it from the
  //        best-scoring printed total (verified against print)
  //  100 - the pair stands alone; total calculated, flagged unverified
  //        so the review banner asks the user to double-check
  let bestFields: ExtractedReceipt | null = null;
  let bestScore = -1;
  const consider = (f: ExtractedReceipt, score: number) => {
    if (score > bestScore) {
      bestScore = score;
      bestFields = f;
    }
  };
  for (const { v, p } of pairs) {
    const computed = round2(v * p);
    if ([...amountFreq.keys()].some((a) => Math.abs(a - computed) <= 0.001)) {
      consider(
        { datetime, volume: v, pricePerUnit: p, totalCost: computed, station, verified: true },
        300 + amountScore(computed)
      );
      continue;
    }
    const totalsByScore = [...amountFreq.keys()].sort((a, b) => amountScore(b) - amountScore(a));
    const bestTotal = totalsByScore[0];
    if (bestTotal != null && amountScore(bestTotal) >= 2 && Math.abs(bestTotal - computed) > 0.25) {
      const p2 = round3(bestTotal / v);
      if (Math.abs(p2 - p) <= 0.05 && Math.abs(round2(v * p2) - bestTotal) <= 0.011) {
        consider(
          { datetime, volume: v, pricePerUnit: p2, totalCost: bestTotal, station, verified: true },
          200 + amountScore(bestTotal)
        );
        continue;
      }
    }
    consider(
      { datetime, volume: v, pricePerUnit: p, totalCost: computed, station, verified: false },
      100
    );
  }
  if (bestFields) return bestFields;

  // ---- anchor 2: a volume figure ("52.565L" - the 3-decimal litres
  // figure is distinctive on a receipt) + best printed total. Volumes
  // adjacent to "AT" score higher; each candidate is tried in order.
  const volScores = new Map<number, number>();
  for (const m of text.matchAll(/(\d{1,3}\.\d{3})\s*L(\s*(?:AT|@))?/gi)) {
    const v = parseFloat(m[1]);
    if (v < 1 || v > 250) continue;
    volScores.set(v, (volScores.get(v) ?? 0) + (m[2] ? 10 : 1));
  }
  const volCands = [...volScores.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
  for (const v of volCands) {
    const totals = [...amountFreq.keys()]
      .map((t) => ({ t, p: round3(t / v) }))
      .filter(({ p }) => p >= 0.5 && p <= 3.5)
      .sort((a, b) => amountScore(b.t) - amountScore(a.t));
    if (totals.length) {
      const { t, p } = totals[0];
      return { datetime, volume: v, pricePerUnit: p, totalCost: t, station, verified: true };
    }
  }
  return null;
}

/** One parse attempt. Throws an AiError on transport or HTTP trouble,
 * returns null when the model answered but produced nothing usable. */
export async function parseReceiptTextOnce(ocrTexts: string[]): Promise<ReceiptFields | null> {
  const cfg = aiConfig();
  if (!cfg) return null;
  const joined = ocrTexts
    .map((t, i) => `--- OCR READ ${i + 1} ---\n${t.slice(0, 4500)}`)
    .join('\n');
  // 40s per attempt keeps two attempts plus OCR under the Cloudflare
  // edge timeout (about 100s)
  const content = await callAi(
    cfg,
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Receipt OCR text:\n"""\n${joined}\n"""` }
    ],
    40000
  );
  return coerceFields(content);
}

/** Parse with one retry on transient failure (used by the one-shot
 *  no-JS form action; the staged UI flow drives attempts itself so it
 *  can show retries in the progress bar). */
export async function parseReceiptText(ocrTexts: string[]): Promise<ReceiptFields | null> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2500));
    try {
      return await parseReceiptTextOnce(ocrTexts);
    } catch (e) {
      // config failures do not heal between attempts, stop right away
      if (e instanceof AiError && !e.retryable) throw e;
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastError ?? new AiError(AI_UNREACHABLE, true);
}

// Vision fallback: the photo itself goes to the model. This is what
// makes pump photos work, pump displays are seven segment LEDs that
// OCR cannot read and their sparse text starves the text paths too.
// The model sorts out receipt vs pump itself, so detection is
// automatic, the flow only gets here when the text paths found nothing.

const VISION_PROMPT = `You are reading a photo related to a fuel purchase. The photo is either (a) a paper fuel receipt, or (b) a fuel pump display showing the completed sale.

Extract the fueling figures and return ONLY a JSON object, no other text:
{"type": "receipt" | "pump" | "other", "volumeLitres": number|null, "totalCost": number|null, "pricePerLitre": number|null, "datetime": string|null}

- volumeLitres: the amount of fuel pumped, in litres (pump displays label it Litres; receipts may say LITRES, VOLUME or similar).
- totalCost: the total amount charged, in dollars.
- pricePerLitre: the price per litre in dollars (for example 1.949) if it is shown anywhere in the photo, otherwise null.
- datetime: the date and time of the purchase as an ISO string if visible (receipts only), otherwise null.
- Pump displays use seven-segment digits: read them digit by digit, carefully.
- If a value is not visible or not readable, use null. Never guess or invent a value.
- Check your work: volumeLitres x pricePerLitre should approximately equal totalCost.`;

/** Round-trip validate a model datetime to 'YYYY-MM-DDTHH:MM'. */
function cleanVisionDateTime(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const cand = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`;
  const d = new Date(cand);
  if (isNaN(d.getTime())) return null;
  const back =
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` +
    `T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return back === cand ? cand : null;
}

/** Capture time from the photo's EXIF block (pump photos show no
 *  date - the camera's timestamp is the purchase time). Returns
 *  'YYYY-MM-DDTHH:MM' or null when no plausible timestamp is present. */
export async function exifDateTime(image: Buffer): Promise<string | null> {
  try {
    const meta = await sharp(image).metadata();
    if (!meta.exif) return null;
    const text = meta.exif.toString('latin1');
    const m = text.match(/(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
    if (!m) return null;
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    const hour = Number(m[4]);
    const min = Number(m[5]);
    if (year < 2015 || year > 2030 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || min > 59) {
      return null;
    }
    return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`;
  } catch {
    return null;
  }
}

function coerceVisionFields(reply: string, exifDt: string | null): ReceiptFields | null {
  const start = reply.indexOf('{');
  const end = reply.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(reply.slice(start, end + 1));
  } catch {
    return null;
  }
  if (obj.type !== 'receipt' && obj.type !== 'pump') return null;
  const fields: ReceiptFields = {
    datetime: obj.type === 'receipt' ? cleanVisionDateTime(obj.datetime) : exifDt,
    volume: posNum(obj.volumeLitres),
    pricePerUnit: posNum(obj.pricePerLitre),
    totalCost: posNum(obj.totalCost),
    station: null
  };
  if (fields.volume == null && fields.totalCost == null && fields.pricePerUnit == null) return null;
  return fields;
}

/** One vision attempt: the photo itself goes to the model. Throws an
 * AiError on transport or HTTP trouble, null when the model found
 * nothing usable. */
export async function parsePhotoVisionOnce(image: Buffer): Promise<ReceiptFields | null> {
  const cfg = aiConfig();
  if (!cfg) return null;
  const prepared = await sharp(image)
    .rotate()
    .resize({ width: 1568, height: 1568, fit: 'inside' })
    .jpeg({ quality: 80 })
    .toBuffer();
  const exifDt = await exifDateTime(image);
  const content = await callAi(
    cfg,
    [
      {
        role: 'user',
        content: [
          { type: 'text', text: VISION_PROMPT },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${prepared.toString('base64')}` } }
        ]
      }
    ],
    60000
  );
  return coerceVisionFields(content, exifDt);
}

/** Vision parse with one retry (one-shot action; the staged UI drives
 *  its own attempts). */
export async function parsePhotoVision(image: Buffer): Promise<ReceiptFields | null> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2500));
    try {
      return await parsePhotoVisionOnce(image);
    } catch (e) {
      if (e instanceof AiError && !e.retryable) throw e;
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastError ?? new AiError(AI_UNREACHABLE, true);
}

/** Cross-derivation and multiply-out check for AI parsed fields. Any
 * two of volume, price and total give the third, so a field the model
 * missed still gets filled from the other two. When all three are
 * there the total has to match volume x price, if it does not the
 * total gets recalculated and flagged for the review banner. */
export function validateAiFields(fields: ReceiptFields): { fields: ReceiptFields; checkFailed: boolean } {
  const out = { ...fields };
  if (out.volume != null && out.pricePerUnit != null && out.totalCost == null) {
    out.totalCost = Math.round(out.volume * out.pricePerUnit * 100) / 100;
  } else if (out.volume != null && out.totalCost != null && out.pricePerUnit == null && out.volume > 0) {
    out.pricePerUnit = Math.round((out.totalCost / out.volume) * 1000) / 1000;
  } else if (out.pricePerUnit != null && out.totalCost != null && out.volume == null && out.pricePerUnit > 0) {
    out.volume = Math.round((out.totalCost / out.pricePerUnit) * 1000) / 1000;
  }
  if (out.volume != null && out.pricePerUnit != null && out.totalCost != null) {
    const computed = Math.round(out.volume * out.pricePerUnit * 100) / 100;
    if (Math.abs(computed - out.totalCost) > 0.02) {
      return { fields: { ...out, totalCost: computed }, checkFailed: true };
    }
  }
  return { fields: out, checkFailed: false };
}

/** Build the /fuel-up redirect URL that prefills the form from fields. */
export function fieldsToFuelUpUrl(fields: ReceiptFields, checkFailed: boolean): string {
  const q = new URLSearchParams({ ai: '1' });
  if (fields.datetime) q.set('datetime', fields.datetime);
  if (fields.volume != null) q.set('volume', String(fields.volume));
  if (fields.pricePerUnit != null) q.set('price', String(fields.pricePerUnit));
  if (fields.totalCost != null) q.set('total', String(fields.totalCost));
  if (fields.station) q.set('station', fields.station);
  if (checkFailed) q.set('check', '1');
  return `/fuel-up?${q.toString()}`;
}
