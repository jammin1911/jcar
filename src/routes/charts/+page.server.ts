import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getSelectedVehicle, getSettings } from '$lib/server/vehicles';
import { getCharts, sparkOf } from '$lib/server/charts';
import { retentionCutoff } from '$lib/server/plans';

export const load: PageServerLoad = async ({ locals, cookies }) => {
  const user = locals.user!;
  const access = await getSelectedVehicle(cookies, user.id);
  if (!access) throw redirect(303, '/vehicle/new');
  const s = await getSettings(user.id);
  const defs = await getCharts(access.vehicle.id, s, await retentionCutoff(user.id), access.vehicle.costTracking === 1);
  const byKey = new Map(defs.map((d) => [d.key, d]));

  const tile = (key: string) => {
    const d = byKey.get(key)!;
    if (d.kind === 'compare') {
      const cmp = d.compareOf && d.fuels ? d.compareOf(d.fuels) : null;
      return {
        key,
        cap: d.cap,
        href: cmp ? `/charts/view?chart=${key}` : null,
        points: '',
        cmp: cmp ? { ...cmp, max: Math.max(cmp.first, cmp.second) || 1 } : null
      };
    }
    const points = sparkOf(d.points);
    return {
      key,
      cap: d.cap,
      // A bars chart with a single month of data is still a chart.
      href: points || (d.kind === 'bars' && d.points.length >= 1) ? `/charts/view?chart=${key}` : null,
      points,
      cmp: null
    };
  };

  return {
    fuelTiles: ['price', 'efficiency', 'fuel-cost', 'volume', 'distance', 'time', 'avg-cmp'].map(tile),
    seTiles: ['service-cost', 'expense-cost'].map(tile),
    overallTiles: ['odometer', 'spending'].map(tile)
  };
};
