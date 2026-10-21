import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getVersionVector } from '$lib/server/versions';
import { getSelectedVehicle } from '$lib/server/vehicles';

// The freshness probe for preloaded pages. The client stamps each
// eager preload with the vector and selection this endpoint returned
// when the preload was made, and asks again on tap. Equal means the
// preload is exactly as fresh as a fetch would be. It only ever
// reads two or three small rows, no record data moves here.
export const GET: RequestHandler = async ({ locals, cookies }) => {
  const user = locals.user!;
  const v = await getVersionVector(user.id);
  const selected = await getSelectedVehicle(cookies, user.id);
  return json(
    { v, sel: selected?.vehicle.id ?? null },
    { headers: { 'cache-control': 'no-store' } }
  );
};
