import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db, users, userSettings } from '$lib/server/db';
import { findUserByEmail } from '$lib/server/users';
import { hashPassword, createSession } from '$lib/server/auth';
import { PLANS, planDef, plansEnabled } from '$lib/server/plans';
import { notifyNtfy } from '$lib/server/notify';
import { clientIp } from '$lib/server/loginThrottle';
import { registrationBlocked, recordRegistrationAttempt } from '$lib/server/registrationThrottle';

// Signup step 2: the account form, reached from the plan cards at
// /register with ?plan=<key>. No plan in the URL bounces back to
// picking one first. Installs without plans skip all of that, the
// form just renders with no plan attached.
export const load: PageServerLoad = async ({ url }) => {
  if (!plansEnabled()) return { plan: null };
  const key = url.searchParams.get('plan');
  // Free plan signup is disabled, its card's Select is greyed out and
  // the form URL bounces back to the cards.
  const plan = PLANS.find((p) => p.key === key && p.key !== 'free');
  if (!plan) throw redirect(303, '/register');
  return { plan };
};

export const actions: Actions = {
  default: async ({ request, cookies, getClientAddress }) => {
    const data = await request.formData();
    // The email address is the username.
    const email = String(data.get('email') ?? '').toLowerCase().trim();
    const displayName = String(data.get('displayName') ?? '').trim();
    const password = String(data.get('password') ?? '');
    const confirm = String(data.get('confirm') ?? '');
    // without plans the submitted field (if any) means nothing, the
    // account gets the top values stored and the gates never read them
    const plan = plansEnabled()
      ? (PLANS.find((p) => p.key === String(data.get('plan') ?? '')) ?? PLANS[0])
      : planDef('paid');
    const values = { email, displayName };

    // Registration spam caps (per-IP attempts + a global breaker).
    // Blocked requests are refused before any account work and do
    // not count toward their own window.
    const ip = clientIp(request, getClientAddress());
    const blocked = registrationBlocked(ip);
    if (blocked) {
      return fail(429, { error: blocked, values });
    }
    recordRegistrationAttempt(ip);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return fail(400, { error: 'Enter a valid email address', values });
    }
    if (displayName.length < 1 || displayName.length > 60) {
      return fail(400, { error: 'Enter a display name (up to 60 characters)', values });
    }
    if (password.length < 6) {
      return fail(400, { error: 'Password must be at least 6 characters', values });
    }
    if (password !== confirm) {
      return fail(400, { error: 'Passwords do not match', values });
    }
    if (await findUserByEmail(email)) {
      return fail(400, { error: 'That email address is already registered', values });
    }

    const inserted = await db
      .insert(users)
      .values({
        username: email,
        displayName,
        passwordHash: hashPassword(password),
        plan: plan.key,
        vehicleLimit: plan.vehicleLimit,
        retentionDays: plan.retentionDays,
        createdAt: new Date().toISOString()
      })
      .returning({ id: users.id });
    const userId = inserted[0].id;
    await db.insert(userSettings).values({ userId });
    // Ping ntfy on every new registration, fire and forget.
    void notifyNtfy(
      'jCar New Registration',
      `New user registered:\n\n${displayName} (${email})` + (plansEnabled() ? `\nPlan: ${plan.name}` : ''),
      'bust_in_silhouette'
    );
    await createSession(cookies, userId);
    throw redirect(303, '/');
  }
};
