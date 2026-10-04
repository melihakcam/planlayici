import fs from "node:fs";
import path from "node:path";

/**
 * Sunucudaki tüm tarih hesapları (gün başı, haftanın günü, çalışma saatleri) yerel saate göre yapılır.
 * Vercel UTC'de çalıştığı için saat dilimini burada sabitliyoruz; Node çalışma anında TZ değişikliğini uygular.
 */
process.env.TZ = process.env.APP_TIMEZONE || "Europe/Istanbul";

/**
 * Tek kullanıcı modunda tüm satırların sahibi. Çok kullanıcıya geçildiğinde
 * oturumdaki kullanıcının id'si kullanılacak (kolonlar şimdiden hazır).
 */
export const OWNER = "owner";

const SCHEMA_VERSION = 5;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS settings (
  user_id TEXT NOT NULL DEFAULT 'owner',
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
);
CREATE TABLE IF NOT EXISTS google_account (
  user_id TEXT PRIMARY KEY DEFAULT 'owner',
  email TEXT, name TEXT, picture TEXT,
  access_token TEXT, refresh_token TEXT, expires_at BIGINT,
  last_sync TEXT, last_error TEXT
);
CREATE TABLE IF NOT EXISTS calendars (
  user_id TEXT NOT NULL DEFAULT 'owner',
  id TEXT NOT NULL,
  summary TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#4f46e5',
  access_role TEXT NOT NULL DEFAULT 'owner',
  is_primary INTEGER NOT NULL DEFAULT 0,
  selected INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, id)
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'owner',
  calendar_id TEXT NOT NULL DEFAULT 'primary',
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  start TEXT NOT NULL,
  "end" TEXT NOT NULL,
  start_ms BIGINT NOT NULL,
  end_ms BIGINT NOT NULL,
  all_day INTEGER NOT NULL DEFAULT 0,
  color_id TEXT,
  reminder_min INTEGER,
  google_id TEXT,
  recurring_event_id TEXT,
  recurrence TEXT,
  series_id TEXT,
  task_id TEXT,
  dirty INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, calendar_id, google_id)
);
CREATE INDEX IF NOT EXISTS idx_events_range ON events(user_id, start_ms, end_ms);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'owner',
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'owner',
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  priority INTEGER NOT NULL DEFAULT 4,
  due TEXT,
  duration_min INTEGER NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'todo',
  repeat TEXT,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  parent_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  event_id TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE TABLE IF NOT EXISTS habits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'owner',
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '✅',
  color TEXT NOT NULL DEFAULT '#6366f1',
  days TEXT NOT NULL DEFAULT '0123456',
  target INTEGER NOT NULL DEFAULT 1,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS habit_logs (
  habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (habit_id, date)
);
CREATE TABLE IF NOT EXISTS focus_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'owner',
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  started_at TEXT NOT NULL,
  minutes INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS journal (
  user_id TEXT NOT NULL DEFAULT 'owner',
  date TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  mood INTEGER,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, date)
);
`;

/** Gelecekteki şema değişiklikleri buraya sürüm sırasıyla eklenir. */
const MIGRATIONS: Record<number, string> = {
  // Gün planlama: proje alanları/hedefleri, görevlerin gün seçimi, günlük plan kayıtları
  2: `
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS area TEXT NOT NULL DEFAULT 'kisisel';
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS deadline TEXT;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS weekly_hours REAL NOT NULL DEFAULT 0;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS planned_date TEXT;
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS top_date TEXT;
    CREATE TABLE IF NOT EXISTS daily_plans (
      user_id TEXT NOT NULL DEFAULT 'owner',
      date TEXT NOT NULL,
      planned_at TEXT,
      note TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (user_id, date)
    );
  `,
  // Google'a gönderilmeyen, yalnızca uygulamada duran takvim (ör. okul ders programı)
  3: `
    INSERT INTO calendars (id, summary, color, access_role, is_primary, selected)
    VALUES ('local:okul', 'Okul Ders Programı', '#3f51b5', 'local', 0, 1)
    ON CONFLICT (user_id, id) DO NOTHING;
  `,
  4: `
    INSERT INTO calendars (id, summary, color, access_role, is_primary, selected)
    VALUES ('local:kurs', 'Kurslar', '#0b8043', 'local', 0, 1)
    ON CONFLICT (user_id, id) DO NOTHING;
  `,
  // Günlük plan blokları ve kişisel etkinlikler: yalnızca uygulamada
  5: `
    INSERT INTO calendars (id, summary, color, access_role, is_primary, selected)
    VALUES ('local:plan', 'Kişisel Plan', '#7c3aed', 'local', 0, 1)
    ON CONFLICT (user_id, id) DO NOTHING;
  `,
};

// ---------------------------------------------------------------------------
// Sürücüler: DATABASE_URL varsa PostgreSQL (Supabase), yoksa yerel PGlite.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;
type Stmt = { text: string; params: unknown[] };
type Driver = {
  query(s: Stmt): Promise<{ rows: Row[]; count: number }>;
  tx(stmts: Stmt[]): Promise<void>;
  exec(sql: string): Promise<void>;
};

/**
 * Aynı anda en fazla `limit` iş çalıştırır. postgres.js tüm bağlantılar meşgulken sorguları
 * aynı bağlantıya art arda (pipelining) yollar; Supabase'in havuzlayıcısı (Supavisor) bunda
 * takılıyor. Sorguları bağlantı sayısı kadar sınırlayarak buna hiç izin vermiyoruz.
 */
function limiter(limit: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active >= limit) await new Promise<void>((r) => queue.push(r));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}

const PG_MAX = 5;

async function postgresDriver(url: string): Promise<Driver> {
  const { default: postgres } = await import("postgres");
  const slot = limiter(PG_MAX);
  const sql = postgres(url, {
    // Supabase bağlantı havuzu (transaction modu) hazır sorguları desteklemez.
    prepare: false,
    max: PG_MAX,
    idle_timeout: 20,
    connect_timeout: 15,
    // BIGINT (ms zaman damgaları, COUNT) değerlerini sayı olarak al.
    types: { bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) } },
  });
  return {
    query: ({ text, params }) =>
      slot(async () => {
        const r = await sql.unsafe(text, params as never[]);
        return { rows: r as unknown as Row[], count: r.count ?? 0 };
      }),
    tx: (stmts) =>
      slot(async () => {
        await sql.begin(async (t) => {
          for (const s of stmts) await t.unsafe(s.text, s.params as never[]);
        });
      }),
    exec: (text) =>
      slot(async () => {
        await sql.unsafe(text);
      }),
  };
}

async function pgliteDriver(): Promise<Driver> {
  const { PGlite, types } = await import("@electric-sql/pglite");
  const dir = path.join(process.cwd(), "data", "pglite");
  fs.mkdirSync(dir, { recursive: true });
  const db = new PGlite(dir, { parsers: { [types.INT8]: (v: string) => Number(v) } });
  return {
    async query({ text, params }) {
      const r = await db.query<Row>(text, params);
      return { rows: r.rows, count: r.affectedRows ?? 0 };
    },
    async tx(stmts) {
      await db.transaction(async (t) => {
        for (const s of stmts) await t.query(s.text, s.params);
      });
    },
    async exec(text) {
      await db.exec(text);
    },
  };
}

async function migrate(d: Driver) {
  await d.exec(SCHEMA);
  const r = await d.query({ text: "SELECT version FROM schema_version LIMIT 1", params: [] });
  let v = r.rows.length ? Number(r.rows[0].version) : 0;
  if (v === 0) {
    // Yeni veritabanı: temel şema 1. sürümdür, sonraki geçişler aşağıda uygulanır.
    v = 1;
    await d.query({ text: "INSERT INTO schema_version (version) VALUES ($1)", params: [v] });
  }
  while (v < SCHEMA_VERSION) {
    v++;
    if (MIGRATIONS[v]) await d.exec(MIGRATIONS[v]);
    await d.query({ text: "UPDATE schema_version SET version = $1", params: [v] });
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __planlayiciDb: Promise<Driver> | undefined;
}

function driver() {
  return (globalThis.__planlayiciDb ??= (async () => {
    const url = process.env.DATABASE_URL;
    const d = url ? await postgresDriver(url) : await pgliteDriver();
    await migrate(d);
    return d;
  })().catch((e) => {
    globalThis.__planlayiciDb = undefined; // sonraki istekte yeniden dene
    throw e;
  }));
}

// ---------------------------------------------------------------------------
// Sorgu yardımcıları. SQL'de "?" (dizi) ya da "@ad" (nesne) parametreleri kullanılır;
// PostgreSQL'in $1, $2 biçimine burada çevrilir.
// ---------------------------------------------------------------------------

export type Args = Record<string, unknown> | unknown[];

const fix = (v: unknown) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v);

function toPg(sql: string, args?: Args): Stmt {
  if (!args) return { text: sql, params: [] };
  if (Array.isArray(args)) {
    let i = 0;
    return { text: sql.replace(/\?/g, () => `$${++i}`), params: args.map(fix) };
  }
  const names: string[] = [];
  const text = sql.replace(/@([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, n: string) => {
    let idx = names.indexOf(n);
    if (idx < 0) idx = names.push(n) - 1;
    return `$${idx + 1}`;
  });
  return { text, params: names.map((n) => fix(args[n])) };
}

export async function all<T = Row>(sql: string, args?: Args): Promise<T[]> {
  return (await (await driver()).query(toPg(sql, args))).rows as T[];
}

export async function get<T = Row>(sql: string, args?: Args): Promise<T | undefined> {
  return (await all<T>(sql, args))[0];
}

export async function run(sql: string, args?: Args) {
  return { changes: (await (await driver()).query(toPg(sql, args))).count };
}

/** Birden fazla yazma işlemini tek atomik işlemde çalıştırır. */
export async function batch(stmts: { sql: string; args?: Args }[]) {
  if (!stmts.length) return;
  await (await driver()).tx(stmts.map((s) => toPg(s.sql, s.args)));
}

export const uid = () => crypto.randomUUID();
export const nowIso = () => new Date().toISOString();

/** Yerel saate göre YYYY-MM-DD */
export function ymd(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function parseYmd(s: string) {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
