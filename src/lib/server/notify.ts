/**
 * ntfy notifications for new feedback messages and new registrations.
 * The topic url comes from the NTFY_URL env var and there is no default,
 * an install that does not set it just never sends anything. Fire and
 * forget, a dead ntfy must never fail the users request so errors are
 * swallowed and the call is time boxed.
 */
export async function notifyNtfy(title: string, body: string, tags: string): Promise<void> {
  // the demo never notifies, its feedback is disposable
  if (process.env.DEMO_MODE === '1') return;
  const url = process.env.NTFY_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { Title: title, Tags: tags },
      body,
      signal: AbortSignal.timeout(5000)
    });
  } catch {
    // best effort only
  }
}
