import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { and, asc, eq } from 'drizzle-orm';
import { db, vehicles, vehicleShares } from '$lib/server/db';
import { bumpUsers, bumpVehicle, vehicleAudience } from '$lib/server/versions';
import { getUserVehicles, VEHICLE_COOKIE } from '$lib/server/vehicles';
import { getUserIdentity } from '$lib/server/users';
import { DEMO_MODE } from '$lib/server/demo';

export const load: PageServerLoad = async ({ locals, cookies }) => {
  const user = locals.user!;
  // The admin account has no vehicles - its home is the admin dashboard.
  if (user.isAdmin) throw redirect(303, '/admin');
  // Disabled vehicles (Manage Vehicles) never appear in the selector.
  const list = (await getUserVehicles(user.id)).filter((a) => a.vehicle.active !== 0);
  const cookieId = Number(cookies.get(VEHICLE_COOKIE));
  const selected = list.find((a) => a.vehicle.id === cookieId) ?? list[0] ?? null;
  // Pending sharing invites drive the red dot on the Sharing tile.
  const pendingInvites = (
    await db
      .select({ id: vehicleShares.id })
      .from(vehicleShares)
      .where(and(eq(vehicleShares.userId, user.id), eq(vehicleShares.status, 'pending')))
  ).length;
  // Someone with no vehicles never sees the tile grid, so their
  // invites would be unreachable. The dashboard carries them instead,
  // as an invite card with Accept/Deny buttons.
  let pendingInviteList: { shareId: number; vehicleName: string; ownerName: string }[] = [];
  if (list.length === 0 && pendingInvites > 0) {
    const rows = await db
      .select({
        shareId: vehicleShares.id,
        vehicleName: vehicles.name,
        ownerId: vehicles.ownerId
      })
      .from(vehicleShares)
      .innerJoin(vehicles, eq(vehicleShares.vehicleId, vehicles.id))
      .where(and(eq(vehicleShares.userId, user.id), eq(vehicleShares.status, 'pending')))
      .orderBy(asc(vehicleShares.id));
    pendingInviteList = await Promise.all(
      rows.map(async (r) => ({
        shareId: r.shareId,
        vehicleName: r.vehicleName,
        ownerName: (await getUserIdentity(r.ownerId)).displayName
      }))
    );
  }
  return {
    demoMode: DEMO_MODE,
    pendingInvites,
    pendingInviteList,
    username: user.username,
    vehicles: list.map((a) => ({
      id: a.vehicle.id,
      name: a.vehicle.name,
      isOwner: a.isOwner,
      costTracking: a.vehicle.costTracking === 1,
      ownerName: a.ownerName
    })),
    selectedId: selected?.vehicle.id ?? null
  };
};

export const actions: Actions = {
  select: async ({ request, cookies, locals }) => {
    const data = await request.formData();
    const id = Number(data.get('vehicleId'));
    const list = await getUserVehicles(locals.user!.id);
    if (list.some((a) => a.vehicle.id === id && a.vehicle.active !== 0)) {
      cookies.set(VEHICLE_COOKIE, String(id), { path: '/', maxAge: 60 * 60 * 24 * 365 });
    }
    throw redirect(303, '/');
  },

  // Invite card actions, same guards as the /sharing ones: the invite
  // has to belong to this user and still be pending.
  acceptInvite: async ({ request, locals }) => {
    const user = locals.user!;
    const shareId = Number((await request.formData()).get('shareId'));
    const rows = await db
      .select()
      .from(vehicleShares)
      .where(
        and(
          eq(vehicleShares.id, shareId),
          eq(vehicleShares.userId, user.id),
          eq(vehicleShares.status, 'pending')
        )
      )
      .limit(1);
    if (rows[0]) {
      await db.transaction(async (tx) => {
        await tx.update(vehicleShares).set({ status: 'accepted' }).where(eq(vehicleShares.id, shareId));
        await bumpVehicle(tx, rows[0].vehicleId);
      });
    }
    throw redirect(303, '/');
  },

  denyInvite: async ({ request, locals }) => {
    const user = locals.user!;
    const shareId = Number((await request.formData()).get('shareId'));
    const rows = await db
      .select()
      .from(vehicleShares)
      .where(
        and(
          eq(vehicleShares.id, shareId),
          eq(vehicleShares.userId, user.id),
          eq(vehicleShares.status, 'pending')
        )
      )
      .limit(1);
    if (rows[0]) {
      await db.transaction(async (tx) => {
        await tx.delete(vehicleShares).where(eq(vehicleShares.id, shareId));
        await bumpUsers(tx, [user.id, ...(await vehicleAudience(tx, rows[0].vehicleId))]);
      });
    }
    throw redirect(303, '/');
  }
};
