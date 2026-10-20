import { error } from '@sveltejs/kit';
import { statSync } from 'node:fs';
import { client, DB_PATH } from './db';

/** Throw 403 unless the signed-in user is the admin. */
export function requireAdmin(locals: App.Locals) {
  if (!locals.user?.isAdmin) throw error(403, 'Admins only');
  return locals.user;
}

function fileSize(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function fmtUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

async function count(sql: string, args: (string | number)[] = []): Promise<number> {
  const r = await client.execute({ sql, args });
  return Number(r.rows[0]?.n ?? 0);
}

/** Service + database health and totals for the admin overview. */
export async function getOverview() {
  const integrity = await client.execute('PRAGMA integrity_check');
  const integrityResult = String(integrity.rows[0]?.integrity_check ?? 'unknown');
  const journal = await client.execute('PRAGMA journal_mode');

  const dbBytes = fileSize(DB_PATH) + fileSize(DB_PATH + '-wal') + fileSize(DB_PATH + '-shm');

  const byTypeRows = await client.execute(
    'SELECT type, COUNT(*) AS n FROM records GROUP BY type'
  );
  const recordsByType: Record<string, number> = { fuel: 0, service: 0, expense: 0, note: 0 };
  for (const r of byTypeRows.rows) recordsByType[String(r.type)] = Number(r.n);

  const mem = process.memoryUsage();
  return {
    db: {
      healthy: integrityResult === 'ok',
      integrity: integrityResult,
      journalMode: String(journal.rows[0]?.journal_mode ?? ''),
      path: DB_PATH,
      sizeBytes: dbBytes,
      size: fmtBytes(dbBytes)
    },
    totals: {
      users: await count('SELECT COUNT(*) AS n FROM users'),
      vehicles: await count('SELECT COUNT(*) AS n FROM vehicles'),
      records: await count('SELECT COUNT(*) AS n FROM records'),
      recordsByType,
      parts: await count('SELECT COUNT(*) AS n FROM vehicle_parts'),
      locations: await count('SELECT COUNT(*) AS n FROM locations'),
      shares: await count('SELECT COUNT(*) AS n FROM vehicle_shares'),
      activeSessions: await count('SELECT COUNT(*) AS n FROM sessions WHERE expires_at > ?', [
        Date.now()
      ]),
      sessions: await count('SELECT COUNT(*) AS n FROM sessions'),
      feedback: await count('SELECT COUNT(*) AS n FROM feedback_messages'),
      feedbackUnread: await count('SELECT COUNT(*) AS n FROM feedback_messages WHERE is_read = 0')
    },
    app: {
      uptime: fmtUptime(process.uptime() * 1000),
      node: process.version,
      memoryRss: fmtBytes(mem.rss),
      memoryHeap: fmtBytes(mem.heapUsed)
    }
  };
}

export interface AdminUserRow {
  id: number;
  email: string;
  displayName: string;
  isAdmin: boolean;
  plan: string;
  createdAt: string;
  lastLoginAt: number | null;
  vehicles: number;
  records: number;
  parts: number;
  locations: number;
  sharedIn: number;
  activeSessions: number;
  contentBytes: number;
}

const USER_STATS_SQL = `
SELECT u.id, u.username, u.display_name, u.is_admin, u.plan, u.created_at, u.last_login_at,
  (SELECT COUNT(*) FROM vehicles v WHERE v.owner_id = u.id) AS vehicles,
  (SELECT COUNT(*) FROM records r WHERE r.user_id = u.id) AS records,
  (SELECT COUNT(*) FROM vehicle_parts p JOIN vehicles v ON v.id = p.vehicle_id WHERE v.owner_id = u.id) AS parts,
  (SELECT COUNT(*) FROM locations l WHERE l.user_id = u.id) AS locations,
  (SELECT COUNT(*) FROM vehicle_shares s WHERE s.user_id = u.id) AS shared_in,
  (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > ?) AS active_sessions,
  (SELECT COALESCE(SUM(LENGTH(COALESCE(r.notes,''))),0) FROM records r WHERE r.user_id = u.id)
  + (SELECT COALESCE(SUM(LENGTH(COALESCE(v.name,'')) + LENGTH(COALESCE(v.make,'')) + LENGTH(COALESCE(v.model,'')) + LENGTH(COALESCE(v.notes,'')) + LENGTH(COALESCE(v.vin,'')) + LENGTH(COALESCE(v.license_plate,''))),0) FROM vehicles v WHERE v.owner_id = u.id)
  + (SELECT COALESCE(SUM(LENGTH(COALESCE(l.street,'')) + LENGTH(COALESCE(l.city,'')) + LENGTH(COALESCE(l.notes,''))),0) FROM locations l WHERE l.user_id = u.id)
  + (SELECT COALESCE(SUM(LENGTH(COALESCE(p.name,'')) + LENGTH(COALESCE(p.notes,''))),0) FROM vehicle_parts p JOIN vehicles v ON v.id = p.vehicle_id WHERE v.owner_id = u.id)
  AS content_bytes
FROM users u
`;

function mapUserRow(r: Record<string, unknown>): AdminUserRow {
  const display = String(r.display_name ?? '').trim();
  return {
    id: Number(r.id),
    email: String(r.username),
    displayName: display || String(r.username),
    isAdmin: Number(r.is_admin) === 1,
    plan: String(r.plan ?? 'free'),
    createdAt: String(r.created_at),
    lastLoginAt: r.last_login_at === null ? null : Number(r.last_login_at),
    vehicles: Number(r.vehicles),
    records: Number(r.records),
    parts: Number(r.parts),
    locations: Number(r.locations),
    sharedIn: Number(r.shared_in),
    activeSessions: Number(r.active_sessions),
    contentBytes: Number(r.content_bytes)
  };
}

/** All users with their usage stats, for the admin users list. */
export async function getUserStats(): Promise<AdminUserRow[]> {
  const r = await client.execute({
    sql: USER_STATS_SQL + ' ORDER BY u.created_at ASC',
    args: [Date.now()]
  });
  return r.rows.map((row) => mapUserRow(row as Record<string, unknown>));
}

/** One user with usage stats, or null. */
export async function getUserStat(userId: number): Promise<AdminUserRow | null> {
  const r = await client.execute({
    sql: USER_STATS_SQL + ' WHERE u.id = ?',
    args: [Date.now(), userId]
  });
  const row = r.rows[0];
  return row ? mapUserRow(row as Record<string, unknown>) : null;
}

/** Names of the vehicles a user owns (admin user detail). */
export async function getUserVehicleNames(userId: number): Promise<string[]> {
  const r = await client.execute({
    sql: 'SELECT name FROM vehicles WHERE owner_id = ? ORDER BY id',
    args: [userId]
  });
  return r.rows.map((row) => String(row.name));
}
