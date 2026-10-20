import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { PLANS, freeForeverPaidRemaining, plansEnabled } from '$lib/server/plans';

// Signup step 1: pick a plan, then the form at
// /register/form?plan=<key>. The Paid card carries the Free Forever
// countdown (see plans.ts). Installs without plans skip the cards
// and go straight to the form.
export const load: PageServerLoad = async () => {
  if (!plansEnabled()) throw redirect(303, '/register/form');
  return {
    plans: PLANS,
    paidRemaining: await freeForeverPaidRemaining()
  };
};
