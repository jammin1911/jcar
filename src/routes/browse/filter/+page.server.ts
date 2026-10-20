import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getSelectedVehicle, getUserVehicles } from '$lib/server/vehicles';
import { parseBrowseFilter, filterQuery, RANGE_OPTIONS } from '$lib/server/browseFilter';

export const load: PageServerLoad = async ({ locals, cookies, url }) => {
  const user = locals.user!;
  const accessible = await getUserVehicles(user.id);
  if (!accessible.length) throw redirect(303, '/vehicle/new');
  const selected = await getSelectedVehicle(cookies, user.id);
  const filter = parseBrowseFilter(
    url,
    accessible.map((a) => a.vehicle.id),
    selected?.vehicle.id ?? accessible[0].vehicle.id
  );

  return {
    vehicles: accessible.map((a) => ({
      id: a.vehicle.id,
      label: a.isOwner ? a.vehicle.name : `${a.vehicle.name} (shared by ${a.ownerName})`,
      checked: filter.vehicleIds.includes(a.vehicle.id)
    })),
    types: [
      { key: 'fuel', label: 'Fuel-Ups' },
      { key: 'service', label: 'Services' },
      { key: 'expense', label: 'Expenses' },
      { key: 'note', label: 'Notes' }
    ].map((t) => ({ ...t, checked: filter.types.includes(t.key) })),
    ranges: RANGE_OPTIONS.map((r) => ({ key: r.key, label: r.label, checked: filter.range === r.key })),
    from: filter.from,
    to: filter.to,
    backHref: `/browse?${filterQuery(filter)}`
  };
};
