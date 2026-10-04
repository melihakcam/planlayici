import { all, batch, get, type Args } from "./db";
import { gfetch } from "./google";
import type { CalendarRow } from "./types";

const WRITABLE = ["owner", "writer", "local"];

/** Yalnızca uygulamada duran (Google'a gönderilmeyen) takvimler "local:" ile başlar. */
export const isLocalCalendar = (id: string) => id.startsWith("local:");

type GCal = {
  id: string;
  summary?: string;
  summaryOverride?: string;
  backgroundColor?: string;
  accessRole: string;
  primary?: boolean;
  selected?: boolean;
  deleted?: boolean;
};

/** Google birincil takvimini "primary" takma adıyla saklarız; eski kayıtlar ve API ikisi de bunu kabul eder. */
const localId = (g: GCal) => (g.primary ? "primary" : g.id);

export function listCalendars() {
  return all<CalendarRow>("SELECT * FROM calendars ORDER BY is_primary DESC, summary");
}

export function getCalendar(id: string) {
  return get<CalendarRow>("SELECT * FROM calendars WHERE id = ?", [id]);
}

/** Takvim listesi henüz yoksa (Google bağlı değil) yazılabilir kabul edilir. */
export async function isWritable(id: string) {
  const c = await getCalendar(id);
  return !c || WRITABLE.includes(c.access_role);
}

export function calendarStmts(id: string): { sql: string; args?: Args }[] {
  return [
    {
      sql: "UPDATE tasks SET event_id = NULL WHERE event_id IN (SELECT id FROM events WHERE calendar_id = ? AND google_id IS NOT NULL)",
      args: [id],
    },
    { sql: "DELETE FROM events WHERE calendar_id = ? AND google_id IS NOT NULL", args: [id] },
  ];
}

/** Google'daki takvim listesini yerel tabloyla eşitler. */
export async function syncCalendarList() {
  const res = await gfetch<{ items: GCal[] }>("/users/me/calendarList?minAccessRole=reader&maxResults=250");
  const items = (res.items || []).filter((g) => !g.deleted);
  const existing = new Map((await listCalendars()).filter((c) => !isLocalCalendar(c.id)).map((c) => [c.id, c]));
  const seen = new Set<string>();
  const stmts: { sql: string; args?: Args }[] = [];
  for (const g of items) {
    const id = localId(g);
    seen.add(id);
    const data = {
      id,
      summary: g.summaryOverride || g.summary || id,
      color: g.backgroundColor || "#4f46e5",
      access_role: g.accessRole,
      is_primary: g.primary ? 1 : 0,
      // Yeni takvimler: birincil ve Google'da görünür olanlar seçili başlar.
      selected: existing.get(id)?.selected ?? (g.primary || g.selected ? 1 : 0),
    };
    stmts.push({
      sql: `INSERT INTO calendars (id, summary, color, access_role, is_primary, selected)
            VALUES (@id, @summary, @color, @access_role, @is_primary, @selected)
            ON CONFLICT(user_id, id) DO UPDATE SET summary=@summary, color=@color, access_role=@access_role,
              is_primary=@is_primary`,
      args: data,
    });
  }
  for (const id of existing.keys()) {
    if (!seen.has(id)) stmts.push(...calendarStmts(id), { sql: "DELETE FROM calendars WHERE id = ?", args: [id] });
  }
  await batch(stmts);
}

/** Senkrona dahil etme / çıkarma. Çıkarılan takvimin yerel kopyaları silinir (Google'da kalır). */
export async function setCalendarSelected(id: string, selected: boolean) {
  await batch([
    { sql: "UPDATE calendars SET selected = ? WHERE id = ?", args: [selected ? 1 : 0, id] },
    ...(selected ? [] : calendarStmts(id)),
  ]);
}
