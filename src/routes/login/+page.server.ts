import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { findUserByEmail, adminExists } from '$lib/server/users';
import { verifyPassword, hashPassword, createSession } from '$lib/server/auth';
import { db, users } from '$lib/server/db';
import { clientIp, lockRemainingMinutes, recordFailure, recordSuccess } from '$lib/server/loginThrottle';

// Compared against when the email is unknown, so a missing account
// takes the same scrypt time as a wrong password and response timing
// does not reveal whether an email is registered.
const DUMMY_HASH = hashPassword('timing-equalization-dummy');

export const load: PageServerLoad = async () => {
  // While no admin account exists yet, the login page explains that
  // signing in as "admin" will prompt to create the admin account.
  // demoUrl only exists on installs that set DEMO_URL, everywhere
  // else the login page shows no demo link at all.
  return { adminSetupPending: !(await adminExists()), demoUrl: process.env.DEMO_URL || null };
};

export const actions: Actions = {
  signin: async ({ request, cookies, getClientAddress }) => {
    const data = await request.formData();
    const email = String(data.get('email') ?? '').toLowerCase().trim();
    const password = String(data.get('password') ?? '');
    const ip = clientIp(request, getClientAddress());

    // First-ever admin login: no admin account exists yet, so ask for a
    // password to create it (see the setupAdmin action).
    if (email === 'admin' && !(await adminExists())) {
      return fail(400, { setupAdmin: true });
    }

    // Brute-force lockout: refuse before checking the password, so a
    // locked pair/IP stays locked even for the correct password.
    const lockedFor = lockRemainingMinutes(email, ip);
    if (lockedFor > 0) {
      return fail(429, {
        error: `Too many failed sign-in attempts. Try again in about ${lockedFor} minute${lockedFor === 1 ? '' : 's'}.`
      });
    }

    const user = await findUserByEmail(email);
    const ok = user ? verifyPassword(password, user.passwordHash) : (verifyPassword(password, DUMMY_HASH), false);
    if (!user || !ok) {
      const nowLockedFor = recordFailure(email, ip);
      if (nowLockedFor > 0) {
        return fail(429, {
          error: `Too many failed sign-in attempts. Try again in about ${nowLockedFor} minute${nowLockedFor === 1 ? '' : 's'}.`
        });
      }
      return fail(400, { error: 'Invalid email or password' });
    }
    recordSuccess(email, ip);
    await createSession(cookies, user.id, data.get('remember') === 'on');
    throw redirect(303, user.isAdmin === 1 ? '/admin' : '/');
  },

  setupAdmin: async ({ request, cookies, getClientAddress }) => {
    if (await adminExists()) {
      return fail(400, { error: 'An admin account already exists. Sign in normally.' });
    }
    const ip = clientIp(request, getClientAddress());
    if (lockRemainingMinutes('admin', ip) > 0) {
      return fail(429, { setupAdmin: true, error: 'Too many attempts. Try again later.' });
    }
    const data = await request.formData();
    const username = String(data.get('username') ?? '').toLowerCase().trim();
    const password = String(data.get('password') ?? '');
    const confirm = String(data.get('confirm') ?? '');
    if (username.length < 1 || username.length > 60) {
      recordFailure('admin', ip);
      return fail(400, { setupAdmin: true, username, error: 'Pick a username between 1 and 60 characters' });
    }
    if (await findUserByEmail(username)) {
      recordFailure('admin', ip);
      return fail(400, { setupAdmin: true, username, error: 'That username is already taken, pick another one' });
    }
    if (password.length < 8) {
      recordFailure('admin', ip);
      return fail(400, { setupAdmin: true, username, error: 'Admin password must be at least 8 characters' });
    }
    if (password !== confirm) {
      recordFailure('admin', ip);
      return fail(400, { setupAdmin: true, username, error: 'Passwords do not match' });
    }
    const [admin] = await db
      .insert(users)
      .values({
        username,
        displayName: username === 'admin' ? 'Administrator' : username,
        passwordHash: hashPassword(password),
        isAdmin: 1,
        // the first account runs the install, it gets the top plan
        plan: 'paid',
        vehicleLimit: 25,
        retentionDays: null,
        createdAt: new Date().toISOString()
      })
      .returning({ id: users.id });
    await createSession(cookies, admin.id, data.get('remember') === 'on');
    throw redirect(303, '/admin');
  }
};
