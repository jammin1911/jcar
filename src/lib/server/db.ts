import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import {
  sqliteTable,
  integer,
  text,
  real,
  uniqueIndex
} from 'drizzle-orm/sqlite-core';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// jCar database, SQLite via Drizzle ORM and libsql. The DB file comes
// from the DATABASE_PATH env var, local dev falls back to ./data/jcar.db.

const dbPath = process.env.DATABASE_PATH || './data/jcar.db';
try {
  mkdirSync(dirname(dbPath), { recursive: true });
} catch {
  // directory already exists / not creatable - libsql will error if real
}

export const client = createClient({ url: `file:${dbPath}` });
export const db = drizzle(client);
export const DB_PATH = dbPath;

// Schema

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // username is just the persons email, everywhere in the app people
  // show up by their display name instead
  username: text('username').notNull().unique(),
  displayName: text('display_name').default(''),
  passwordHash: text('password_hash').notNull(),
  isAdmin: integer('is_admin').notNull().default(0),
  lastLoginAt: integer('last_login_at'),
  /** plan, 'free' or 'paid'. The limits below are what the account
   *  actually gets and they can be changed in Admin. */
  plan: text('plan').notNull().default('free'),
  vehicleLimit: integer('vehicle_limit').notNull().default(2),
  /** days of record history visible, NULL means forever. Records are
   *  never deleted for retention, just hidden from the users views. */
  retentionDays: integer('retention_days'),
  createdAt: text('created_at').notNull(),
  /** bumped on every change that can alter what this user sees, the
   *  freshness probe compares it before trusting a preloaded page */
  dataVersion: integer('data_version').notNull().default(0)
});

/** Feedback and support messages from users. */
export const feedbackMessages = sqliteTable('feedback_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  /** email snapshot at send time */
  email: text('email').default(''),
  message: text('message').notNull(),
  isRead: integer('is_read').notNull().default(0),
  /** processed photo filename in the photos dir, when one was attached */
  photoPath: text('photo_path'),
  createdAt: text('created_at').notNull()
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  expiresAt: integer('expires_at').notNull()
});

export const vehicles = sqliteTable('vehicles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ownerId: integer('owner_id')
    .notNull()
    .references(() => users.id),
  name: text('name').notNull(),
  year: text('year').default(''),
  make: text('make').default(''),
  model: text('model').default(''),
  submodel: text('submodel').default(''),
  engine: text('engine').default(''),
  transmission: text('transmission').default(''),
  driveType: text('drive_type').default(''),
  bodyType: text('body_type').default(''),
  distanceUnit: text('distance_unit').default('Kilometers'),
  volumeUnit: text('volume_unit').default('Liters'),
  licensePlate: text('license_plate').default(''),
  vin: text('vin').default(''),
  tankCapacity: real('tank_capacity'),
  notes: text('notes').default(''),
  purchasedOdometer: real('purchased_odometer'),
  purchasedPrice: real('purchased_price'),
  purchasedDate: text('purchased_date').default(''),
  purchasedNotes: text('purchased_notes').default(''),
  soldOdometer: real('sold_odometer'),
  soldPrice: real('sold_price'),
  soldDate: text('sold_date').default(''),
  soldNotes: text('sold_notes').default(''),
  /** 1 = enabled and shows in the selector, 0 = disabled by the owner
   *  in Manage Vehicles. Data is kept, just hidden from selection. */
  active: integer('active').notNull().default(1),
  /** 1 = cost tracking only (jerry can, car washes), no odometer
   *  exists for this entry. Record forms hide the odometer fields and
   *  displays ignore any stored odometer values for the vehicle. */
  costTracking: integer('cost_tracking').notNull().default(0),
  createdAt: text('created_at').notNull(),
  /** bumped with every record, photo or part change on the vehicle */
  dataVersion: integer('data_version').notNull().default(0)
});

export const vehicleShares = sqliteTable(
  'vehicle_shares',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    vehicleId: integer('vehicle_id')
      .notNull()
      .references(() => vehicles.id),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    /** 'pending' means invited with no access yet, or 'accepted' */
    status: text('status').notNull().default('accepted')
  },
  (t) => [uniqueIndex('vehicle_shares_vehicle_user').on(t.vehicleId, t.userId)]
);

// One table for all four record types: fuel, service, expense, note
export const records = sqliteTable('records', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  vehicleId: integer('vehicle_id')
    .notNull()
    .references(() => vehicles.id),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  type: text('type').notNull(),
  /** display title for service/expense records (aCar event subtype name on import) */
  title: text('title').default(''),
  datetime: text('datetime').notNull(), // ISO 8601
  odometer: real('odometer'),
  pricePerUnit: real('price_per_unit'),
  volume: real('volume'),
  totalCost: real('total_cost'),
  partial: integer('partial').default(0),
  missed: integer('missed').default(0),
  notes: text('notes').default(''),
  locationId: integer('location_id').references(() => locations.id),
  createdAt: text('created_at').notNull()
});

export const recordPhotos = sqliteTable('record_photos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  recordId: integer('record_id')
    .notNull()
    .references(() => records.id),
  /** stored file name under <data>/photos/ - always "<id>.jpg" */
  filename: text('filename').default(''),
  bytes: integer('bytes').default(0),
  createdAt: text('created_at').notNull()
});

export const vehicleParts = sqliteTable('vehicle_parts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  vehicleId: integer('vehicle_id')
    .notNull()
    .references(() => vehicles.id),
  name: text('name').notNull(),
  partNumber: text('part_number').default(''),
  type: text('type').default(''),
  brand: text('brand').default(''),
  size: text('size').default(''),
  volume: text('volume').default(''),
  pressure: text('pressure').default(''),
  quantity: real('quantity'),
  notes: text('notes').default('')
});

export const locations = sqliteTable('locations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  street: text('street').default(''),
  city: text('city').default(''),
  province: text('province').default(''),
  postalCode: text('postal_code').default(''),
  country: text('country').default(''),
  notes: text('notes').default('')
});

export const userSettings = sqliteTable('user_settings', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id),
  // 'mdy' = Oct 14, 2026 - 09:50 a.m. | 'iso' = 2026-10-14 09:50 | 'dmy' = 14 Oct 2026 - 09:50
  dateFormat: text('date_format').default('mdy'),
  distanceUnit: text('distance_unit').default('Kilometers'),
  volumeUnit: text('volume_unit').default('Liters'),
  efficiencyUnit: text('efficiency_unit').default('L/100km'), // or 'MPG (US)'
  theme: text('theme').default('light') // or 'dark'
});

// Init, idempotent

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT DEFAULT '',
  password_hash TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  last_login_at INTEGER,
  plan TEXT NOT NULL DEFAULT 'free',
  vehicle_limit INTEGER NOT NULL DEFAULT 2,
  retention_days INTEGER,
  created_at TEXT NOT NULL,
  data_version INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS feedback_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  email TEXT DEFAULT '',
  message TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  photo_path TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  year TEXT DEFAULT '',
  make TEXT DEFAULT '',
  model TEXT DEFAULT '',
  submodel TEXT DEFAULT '',
  engine TEXT DEFAULT '',
  transmission TEXT DEFAULT '',
  drive_type TEXT DEFAULT '',
  body_type TEXT DEFAULT '',
  distance_unit TEXT DEFAULT 'Kilometers',
  volume_unit TEXT DEFAULT 'Liters',
  license_plate TEXT DEFAULT '',
  vin TEXT DEFAULT '',
  tank_capacity REAL,
  notes TEXT DEFAULT '',
  purchased_odometer REAL,
  purchased_price REAL,
  purchased_date TEXT DEFAULT '',
  purchased_notes TEXT DEFAULT '',
  sold_odometer REAL,
  sold_price REAL,
  sold_date TEXT DEFAULT '',
  sold_notes TEXT DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  cost_tracking INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  data_version INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS vehicle_shares (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'accepted'
);
CREATE UNIQUE INDEX IF NOT EXISTS vehicle_shares_vehicle_user ON vehicle_shares(vehicle_id, user_id);
CREATE TABLE IF NOT EXISTS records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  title TEXT DEFAULT '',
  datetime TEXT NOT NULL,
  odometer REAL,
  price_per_unit REAL,
  volume REAL,
  total_cost REAL,
  partial INTEGER DEFAULT 0,
  missed INTEGER DEFAULT 0,
  notes TEXT DEFAULT '',
  location_id INTEGER REFERENCES locations(id),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS record_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  record_id INTEGER NOT NULL REFERENCES records(id),
  filename TEXT DEFAULT '',
  bytes INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS vehicle_parts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  name TEXT NOT NULL,
  part_number TEXT DEFAULT '',
  type TEXT DEFAULT '',
  brand TEXT DEFAULT '',
  size TEXT DEFAULT '',
  volume TEXT DEFAULT '',
  pressure TEXT DEFAULT '',
  quantity REAL,
  notes TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  street TEXT DEFAULT '',
  city TEXT DEFAULT '',
  province TEXT DEFAULT '',
  postal_code TEXT DEFAULT '',
  country TEXT DEFAULT '',
  notes TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS user_settings (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  date_format TEXT DEFAULT 'mdy',
  distance_unit TEXT DEFAULT 'Kilometers',
  volume_unit TEXT DEFAULT 'Liters',
  efficiency_unit TEXT DEFAULT 'L/100km',
  theme TEXT DEFAULT 'light'
);
CREATE INDEX IF NOT EXISTS records_vehicle_dt ON records(vehicle_id, datetime, id);
CREATE INDEX IF NOT EXISTS record_photos_record ON record_photos(record_id);
CREATE INDEX IF NOT EXISTS vehicles_owner ON vehicles(owner_id);
CREATE INDEX IF NOT EXISTS vehicle_parts_vehicle ON vehicle_parts(vehicle_id);
CREATE INDEX IF NOT EXISTS locations_user ON locations(user_id);
`;

let initPromise: Promise<void> | null = null;
export function initDb(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      for (const stmt of INIT_SQL.split(';')) {
        const s = stmt.trim();
        if (s) await client.execute(s);
      }
      // Migrations for columns added after a DB was first created.
      const cols = await client.execute('PRAGMA table_info(users)');
      const has = (n: string) => cols.rows.some((r) => r.name === n);
      if (!has('display_name')) {
        await client.execute("ALTER TABLE users ADD COLUMN display_name TEXT DEFAULT ''");
      }
      if (!has('is_admin')) {
        await client.execute('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0');
      }
      if (!has('last_login_at')) {
        await client.execute('ALTER TABLE users ADD COLUMN last_login_at INTEGER');
      }
      if (!has('data_version')) {
        await client.execute('ALTER TABLE users ADD COLUMN data_version INTEGER NOT NULL DEFAULT 0');
      }
      if (!has('plan')) {
        await client.execute("ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free'");
        await client.execute('ALTER TABLE users ADD COLUMN vehicle_limit INTEGER NOT NULL DEFAULT 2');
        await client.execute('ALTER TABLE users ADD COLUMN retention_days INTEGER');
        // Accounts from before plans existed get Paid (25 vehicles,
        // forever retention) so nobody loses access to what they have.
        await client.execute(
          "UPDATE users SET plan = 'paid', vehicle_limit = 25, retention_days = NULL"
        );
      }
      const recCols = await client.execute('PRAGMA table_info(records)');
      if (!recCols.rows.some((r) => r.name === 'title')) {
        await client.execute("ALTER TABLE records ADD COLUMN title TEXT DEFAULT ''");
      }
      const vehCols = await client.execute('PRAGMA table_info(vehicles)');
      if (!vehCols.rows.some((r) => r.name === 'active')) {
        await client.execute('ALTER TABLE vehicles ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
      }
      if (!vehCols.rows.some((r) => r.name === 'cost_tracking')) {
        await client.execute('ALTER TABLE vehicles ADD COLUMN cost_tracking INTEGER NOT NULL DEFAULT 0');
      }
      if (!vehCols.rows.some((r) => r.name === 'data_version')) {
        await client.execute('ALTER TABLE vehicles ADD COLUMN data_version INTEGER NOT NULL DEFAULT 0');
      }
      const setCols = await client.execute('PRAGMA table_info(user_settings)');
      if (!setCols.rows.some((r) => r.name === 'theme')) {
        await client.execute("ALTER TABLE user_settings ADD COLUMN theme TEXT DEFAULT 'light'");
      }
      const fbCols = await client.execute('PRAGMA table_info(feedback_messages)');
      if (!fbCols.rows.some((r) => r.name === 'photo_path')) {
        await client.execute('ALTER TABLE feedback_messages ADD COLUMN photo_path TEXT');
      }
      // Shares from before the invite flow were granted instantly, so
      // existing rows default to accepted and keep working.
      const shareCols = await client.execute('PRAGMA table_info(vehicle_shares)');
      if (!shareCols.rows.some((r) => r.name === 'status')) {
        await client.execute("ALTER TABLE vehicle_shares ADD COLUMN status TEXT NOT NULL DEFAULT 'accepted'");
      }
      // This index sits on the status column, so it can only be made
      // once the guard above has had its chance to add it. It cannot
      // live in INIT_SQL with the other indexes.
      await client.execute('CREATE INDEX IF NOT EXISTS vehicle_shares_user ON vehicle_shares(user_id, status)');
    })();
  }
  return initPromise;
}
