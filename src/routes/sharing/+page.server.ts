import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { and, asc, eq } from 'drizzle-orm';
import { db, vehicles, vehicleShares } from '$lib/server/db';
import { findUserByEmail, getUserIdentity } from '$lib/server/users';
import { getVehicleAccess } from '$lib/server/vehicles';

/**
 * Vehicle sharing hub. Sharing works as an invite: the owner invites
 * by email and the vehicle sits in the recipient's "Shared with me"
 * as pending (no access, not in their selector) until they accept.
 * The owner sees every share and its status under "My vehicles" and
 * can revoke anytime, and a recipient who accepted can leave. All
 * state lives in vehicle_shares.status.
 */
export const load: PageServerLoad = async ({ locals }) => {
  const user = locals.user!;

  const incomingRows = await db
    .select({
      shareId: vehicleShares.id,
      status: vehicleShares.status,
      vehicleId: vehicles.id,
      vehicleName: vehicles.name,
      active: vehicles.active,
      ownerId: vehicles.ownerId
    })
    .from(vehicleShares)
    .innerJoin(vehicles, eq(vehicleShares.vehicleId, vehicles.id))
    .where(eq(vehicleShares.userId, user.id))
    .orderBy(asc(vehicleShares.id));
  const incoming = await Promise.all(
    incomingRows.map(async (r) => ({
      shareId: r.shareId,
      status: r.status,
      vehicleId: r.vehicleId,
      vehicleName: r.vehicleName,
      vehicleActive: r.active !== 0,
      ownerName: (await getUserIdentity(r.ownerId)).displayName
    }))
  );
  // Pending invites first, then accepted shares.
  incoming.sort((a, b) => (a.status === b.status ? 0 : a.status === 'pending' ? -1 : 1));

  const owned = await db
    .select()
    .from(vehicles)
    .where(eq(vehicles.ownerId, user.id))
    .orderBy(asc(vehicles.id));
  const mine = await Promise.all(
    owned.map(async (v) => {
      const shareRows = await db
        .select({ id: vehicleShares.id, userId: vehicleShares.userId, status: vehicleShares.status })
        .from(vehicleShares)
        .where(eq(vehicleShares.vehicleId, v.id))
        .orderBy(asc(vehicleShares.id));
      const shares = await Promise.all(
        shareRows.map(async (s) => {
          const ident = await getUserIdentity(s.userId);
          return { shareId: s.id, status: s.status, displayName: ident.displayName, email: ident.email };
        })
      );
      return {
        id: v.id,
        name: v.name,
        active: v.active !== 0,
        sub: [v.year, v.make, v.model].filter(Boolean).join(' '),
        shares
      };
    })
  );

  return { incoming, mine };
};

async function myShare(shareId: number, userId: number) {
  const rows = await db
    .select()
    .from(vehicleShares)
    .where(and(eq(vehicleShares.id, shareId), eq(vehicleShares.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export const actions: Actions = {
  share: async ({ request, locals }) => {
    const user = locals.user!;
    const data = await request.formData();
    const vehicleId = Number(data.get('vehicleId'));
    const email = String(data.get('email') ?? '').toLowerCase().trim();
    const access = await getVehicleAccess(user.id, vehicleId);
    if (!access || !access.isOwner) {
      return fail(403, { error: 'Only the owner can share this vehicle' });
    }
    if (!email) return fail(400, { error: 'Enter the email address of the person to share with' });
    const target = await findUserByEmail(email);
    if (!target) return fail(400, { error: `No registered user with email "${email}"` });
    if (target.id === user.id) return fail(400, { error: 'You already own this vehicle' });
    const targetName = (await getUserIdentity(target.id)).displayName;
    const existing = await db
      .select()
      .from(vehicleShares)
      .where(and(eq(vehicleShares.vehicleId, vehicleId), eq(vehicleShares.userId, target.id)))
      .limit(1);
    if (existing[0]) {
      return fail(400, {
        error:
          existing[0].status === 'pending'
            ? `${targetName} already has an invite for this vehicle`
            : `This vehicle is already shared with ${targetName}`
      });
    }
    await db.insert(vehicleShares).values({ vehicleId, userId: target.id, status: 'pending' });
    return { ok: `Invite sent to ${targetName} - they can accept it on their Sharing page` };
  },

  accept: async ({ request, locals }) => {
    const user = locals.user!;
    const shareId = Number((await request.formData()).get('shareId'));
    const row = await myShare(shareId, user.id);
    if (!row || row.status !== 'pending') return fail(400, { error: 'That invite is no longer pending' });
    await db.update(vehicleShares).set({ status: 'accepted' }).where(eq(vehicleShares.id, shareId));
    return { ok: 'Vehicle shared with you - it is now in your vehicle selector' };
  },

  deny: async ({ request, locals }) => {
    const user = locals.user!;
    const shareId = Number((await request.formData()).get('shareId'));
    const row = await myShare(shareId, user.id);
    if (!row || row.status !== 'pending') return fail(400, { error: 'That invite is no longer pending' });
    await db.delete(vehicleShares).where(eq(vehicleShares.id, shareId));
    return { ok: 'Invite declined' };
  },

  leave: async ({ request, locals }) => {
    const user = locals.user!;
    const shareId = Number((await request.formData()).get('shareId'));
    const row = await myShare(shareId, user.id);
    if (!row || row.status !== 'accepted') return fail(400, { error: 'That share is not active' });
    await db.delete(vehicleShares).where(eq(vehicleShares.id, shareId));
    return { ok: 'Vehicle removed from your account' };
  },

  revoke: async ({ request, locals }) => {
    const user = locals.user!;
    const shareId = Number((await request.formData()).get('shareId'));
    const rows = await db.select().from(vehicleShares).where(eq(vehicleShares.id, shareId)).limit(1);
    const row = rows[0];
    if (!row) return fail(404, { error: 'That share no longer exists' });
    const access = await getVehicleAccess(user.id, row.vehicleId);
    if (!access || !access.isOwner) {
      return fail(403, { error: 'Only the owner can change sharing' });
    }
    await db.delete(vehicleShares).where(eq(vehicleShares.id, shareId));
    return { ok: 'Share removed' };
  }
};
