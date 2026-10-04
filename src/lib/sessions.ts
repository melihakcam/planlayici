import { addDays, all, batch, nowIso, parseYmd, uid, ymd } from "./db";
import { weekRange } from "./projects";

/** Planla ekranı: haftalık proje seçimi ve günün boş saatlerine 45 dakikalık oturum yerleştirme. */
export const SESSION_MIN = 45;
export const BREAK_MIN = 10;
const PLAN_CAL = "local:plan";
const M = 60_000;

export type Window = { start: string; end: string };
export type PlanItem = { projectId: string; sessions: number };
export type PlacedSession = { projectId: string; title: string; color: string; start: string; end: string };

/** Varsayılan boş saatler: Pzt–Per kurstan sonra, Cuma ve hafta sonu tüm gün (ekranda her seferinde değiştirilebilir). */
export function defaultWindows(date: string): Window[] {
  const wd = parseYmd(date).getDay();
  return wd >= 1 && wd <= 4 ? [{ start: "22:30", end: "00:30" }] : [{ start: "10:00", end: "00:00" }];
}

/** "22:30"–"00:30" gibi gece yarısını geçen aralıkları da milisaniyeye çevirir. */
function windowMs(date: string, w: Window) {
  const [sh, sm] = w.start.split(":").map(Number);
  const [eh, em] = w.end.split(":").map(Number);
  const s = parseYmd(date);
  s.setHours(sh, sm, 0, 0);
  const e = parseYmd(date);
  e.setHours(eh, em, 0, 0);
  if (e <= s) e.setDate(e.getDate() + 1);
  return { start: s.getTime(), end: e.getTime() };
}

/** Bir günün oturumları: o gün 00:00'dan ertesi gün 06:00'ya kadar başlayanlar (gece oturumları dahil). */
function dayRange(date: string) {
  const s = parseYmd(date);
  return { from: s.getTime(), to: addDays(s, 1).getTime() + 6 * 3_600_000 };
}

export async function getPlanData(date: string) {
  const { start, end } = await weekRange(parseYmd(date));
  const week = ymd(start);
  const { from, to } = dayRange(date);
  const [projects, chosen, placed, today] = await Promise.all([
    all<{ id: string; name: string; color: string; area: string }>(
      "SELECT id, name, color, area FROM projects WHERE status = 'active' ORDER BY created_at",
    ),
    all<{ project_id: string; sessions: number }>("SELECT project_id, sessions FROM week_projects WHERE week = ?", [week]),
    all<{ series_id: string; n: number }>(
      `SELECT series_id, COUNT(*)::int AS n FROM events
       WHERE deleted = 0 AND series_id LIKE 'oturum:%' AND start_ms >= ? AND start_ms < ? GROUP BY series_id`,
      [start.getTime(), end.getTime()],
    ),
    all<{ id: string; title: string; start: string; end: string; series_id: string }>(
      `SELECT id, title, start, "end", series_id FROM events
       WHERE deleted = 0 AND series_id LIKE 'oturum:%' AND start_ms >= ? AND start_ms < ? ORDER BY start_ms`,
      [from, to],
    ),
  ]);
  const goal = new Map(chosen.map((c) => [c.project_id, c.sessions]));
  const done = new Map(placed.map((p) => [p.series_id.slice(7), p.n]));
  return {
    week,
    date,
    sessionMin: SESSION_MIN,
    breakMin: BREAK_MIN,
    defaultWindows: defaultWindows(date),
    projects: projects.map((p) => ({ ...p, selected: goal.has(p.id), weekSessions: goal.get(p.id) ?? 0, placed: done.get(p.id) ?? 0 })),
    daySessions: today.map((e) => ({ id: e.id, title: e.title, start: e.start, end: e.end, projectId: e.series_id.slice(7) })),
  };
}

export async function saveWeek(date: string, items: PlanItem[]) {
  const week = ymd((await weekRange(parseYmd(date))).start);
  await batch([
    { sql: "DELETE FROM week_projects WHERE week = ?", args: [week] },
    ...items
      .filter((i) => i.sessions > 0)
      .map((i) => ({
        sql: "INSERT INTO week_projects (week, project_id, sessions) VALUES (?, ?, ?)",
        args: [week, i.projectId, Math.min(40, Math.round(i.sessions))],
      })),
  ]);
}

/**
 * Seçilen oturumları günün boş aralıklarına sırayla yerleştirir (projeler dönüşümlü, aralarda mola).
 * Takvimdeki diğer etkinliklerle çakışmaz. dryRun değilse o günün eski oturumlarını silip yenilerini yazar.
 */
export async function planDay(date: string, windows: Window[], items: PlanItem[], dryRun: boolean) {
  const { from, to } = dayRange(date);
  const projects = await all<{ id: string; name: string; color: string }>("SELECT id, name, color FROM projects");
  const byId = new Map(projects.map((p) => [p.id, p]));
  const busy = await all<{ start_ms: number; end_ms: number }>(
    `SELECT e.start_ms, e.end_ms FROM events e JOIN calendars c ON c.id = e.calendar_id
     WHERE e.deleted = 0 AND e.all_day = 0 AND c.selected = 1 AND (e.series_id IS NULL OR e.series_id NOT LIKE 'oturum:%')
       AND e.start_ms < ? AND e.end_ms > ?`,
    [to + 86_400_000, from],
  );

  // Projeleri dönüşümlü sırala: A, B, A, B, A…
  const left = items.filter((i) => i.sessions > 0 && byId.has(i.projectId)).map((i) => ({ ...i }));
  const queue: string[] = [];
  while (left.some((i) => i.sessions > 0)) {
    for (const i of left) {
      if (i.sessions > 0) {
        queue.push(i.projectId);
        i.sessions--;
      }
    }
  }

  // Bugünse geçmiş saatlere koyma (5 dakikaya yuvarla)
  const now = Math.ceil(Date.now() / (5 * M)) * 5 * M;
  const placed: PlacedSession[] = [];
  const ranges = windows.map((w) => windowMs(date, w)).sort((a, b) => a.start - b.start);
  let qi = 0;
  for (const r of ranges) {
    let t = Math.max(r.start, now);
    while (qi < queue.length && t + SESSION_MIN * M <= r.end) {
      const clash = busy.find((b) => b.start_ms < t + SESSION_MIN * M && b.end_ms > t);
      if (clash) {
        t = clash.end_ms;
        continue;
      }
      const p = byId.get(queue[qi++])!;
      placed.push({
        projectId: p.id,
        title: p.name,
        color: p.color,
        start: new Date(t).toISOString(),
        end: new Date(t + SESSION_MIN * M).toISOString(),
      });
      t += (SESSION_MIN + BREAK_MIN) * M;
    }
  }
  const unplaced = queue.slice(qi).map((id) => byId.get(id)!.name);

  if (!dryRun) {
    const ts = nowIso();
    await batch([
      {
        sql: "DELETE FROM events WHERE calendar_id = ? AND series_id LIKE 'oturum:%' AND start_ms >= ? AND start_ms < ?",
        args: [PLAN_CAL, from, to],
      },
      ...placed.map((s) => ({
        sql: `INSERT INTO events (id, calendar_id, title, start, "end", start_ms, end_ms, series_id, dirty, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        args: [uid(), PLAN_CAL, s.title, s.start, s.end, Date.parse(s.start), Date.parse(s.end), `oturum:${s.projectId}`, ts, ts],
      })),
      {
        sql: `INSERT INTO daily_plans (date, planned_at) VALUES (?, ?)
              ON CONFLICT (user_id, date) DO UPDATE SET planned_at = EXCLUDED.planned_at`,
        args: [date, ts],
      },
    ]);
  }
  return { placed, unplaced };
}
