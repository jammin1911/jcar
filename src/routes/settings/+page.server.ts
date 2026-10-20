import type { Actions, PageServerLoad } from './$types';
import { eq } from 'drizzle-orm';
import { db, userSettings } from '$lib/server/db';
import { getSettings } from '$lib/server/vehicles';

export const load: PageServerLoad = async ({ locals }) => {
  const user = locals.user!;
  return { settings: await getSettings(user.id), username: user.username, displayName: user.displayName };
};

export const actions: Actions = {
  default: async ({ request, locals }) => {
    const user = locals.user!;
    const data = await request.formData();
    const values = {
      userId: user.id,
      dateFormat: String(data.get('dateFormat') ?? 'mdy'),
      distanceUnit: String(data.get('distanceUnit') ?? 'Kilometers'),
      volumeUnit: String(data.get('volumeUnit') ?? 'Liters'),
      efficiencyUnit: String(data.get('efficiencyUnit') ?? 'L/100km'),
      theme: String(data.get('theme') ?? 'light') === 'dark' ? 'dark' : 'light'
    };
    await db
      .insert(userSettings)
      .values(values)
      .onConflictDoUpdate({ target: userSettings.userId, set: values });
    return { saved: true };
  }
};
