import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getUserVehicles } from '$lib/server/vehicles';
import { getVehicleRecords } from '$lib/server/stats';
import { retentionCutoff, exportBlocked } from '$lib/server/plans';
import { csvEscape } from '$lib/server/csv';

// Exports all of the user's vehicles (owned and shared) in one
// file. The leading Vehicle column keeps each record attributable,
// and the plan retention cutoff still applies.
export const GET: RequestHandler = async ({ locals }) => {
  if (await exportBlocked(locals.user!.id)) throw redirect(303, '/import-export?upgrade=1');
  const list = await getUserVehicles(locals.user!.id);
  if (list.length === 0) throw redirect(303, '/vehicle/new');
  const cutoff = await retentionCutoff(locals.user!.id);
  const header = ['Vehicle', 'Type', 'Title', 'Date', 'Odometer', 'Price', 'Volume', 'Total Cost', 'Partial', 'Missed', 'Notes'];
  const lines = [header.join(',')];
  for (const access of list) {
    const all = await getVehicleRecords(access.vehicle.id, cutoff, access.vehicle.costTracking === 1);
    for (const r of all) {
      lines.push(
        [
          csvEscape(access.vehicle.name),
          csvEscape(r.type),
          csvEscape(r.title),
          csvEscape(r.datetime),
          csvEscape(r.odometer),
          csvEscape(r.pricePerUnit),
          csvEscape(r.volume),
          csvEscape(r.totalCost),
          csvEscape(r.partial ? 'Yes' : 'No'),
          csvEscape(r.missed ? 'Yes' : 'No'),
          csvEscape(r.notes)
        ].join(',')
      );
    }
  }
  return new Response(lines.join('\r\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="jcar-records.csv"'
    }
  });
};
