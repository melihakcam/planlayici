import { addDays, all, get, nowIso, run, ymd } from "@/lib/db";
import { listHabits } from "@/lib/habits";
import { body, json, route } from "@/lib/http";
import { listProjectStats, weekRange } from "@/lib/projects";

export const dynamic = "force-dynamic";

const noteKey = (start: Date) => `hafta-${ymd(start)}`;

/** Haftalık değerlendirme: ?offset=0 bu hafta, -1 geçen hafta */
export const GET = route(async (req) => {
  const offset = Number(new URL(req.url).searchParams.get("offset")) || 0;
  const { start, end } = await weekRange(addDays(new Date(), offset * 7));
  const keys = Array.from({ length: 7 }, (_, i) => ymd(addDays(start, i)));
  const s = start.toISOString();
  const e = end.toISOString();

  const [done, focus, blocks, open, projects, habits, moods, note] = await Promise.all([
    all<{ id: string; title: string; completed_at: string; project_id: string | null }>(
      "SELECT id, title, completed_at, project_id FROM tasks WHERE status = 'done' AND completed_at >= ? AND completed_at < ?",
      [s, e],
    ),
    all<{ started_at: string; minutes: number }>("SELECT started_at, minutes FROM focus_sessions WHERE abandoned = 0 AND started_at >= ? AND started_at < ?", [s, e]),
    all<{ start_ms: number; end_ms: number; task_id: string | null }>(
      "SELECT start_ms, end_ms, task_id FROM events WHERE deleted = 0 AND all_day = 0 AND start_ms >= ? AND start_ms < ?",
      [start.getTime(), end.getTime()],
    ),
    // Bu haftaya tarihlenmiş ama yapılmamış işler
    all<{ id: string; title: string; due: string; project_id: string | null }>(
      "SELECT id, title, due, project_id FROM tasks WHERE status = 'todo' AND parent_id IS NULL AND due >= ? AND due < ? ORDER BY due",
      [ymd(start), ymd(end)],
    ),
    listProjectStats(start),
    listHabits(),
    all<{ date: string; mood: number }>("SELECT date, mood FROM journal WHERE mood IS NOT NULL AND date >= ? AND date < ?", [ymd(start), ymd(end)]),
    get<{ content: string }>("SELECT content FROM journal WHERE date = ?", [noteKey(start)]),
  ]);

  const days = keys.map((k) => ({ date: k, tasks: 0, focus: 0, busyHours: 0, taskHours: 0 }));
  const idx = new Map(keys.map((k, i) => [k, i]));
  for (const t of done) {
    const i = idx.get(ymd(new Date(t.completed_at)));
    if (i !== undefined) days[i].tasks++;
  }
  for (const f of focus) {
    const i = idx.get(ymd(new Date(f.started_at)));
    if (i !== undefined) days[i].focus += f.minutes;
  }
  for (const b of blocks) {
    const i = idx.get(ymd(new Date(b.start_ms)));
    if (i === undefined) continue;
    const h = (b.end_ms - b.start_ms) / 3_600_000;
    if (b.task_id) days[i].taskHours += h;
    else days[i].busyHours += h;
  }

  let planned = 0;
  let hit = 0;
  for (const h of habits) {
    keys.forEach((k, i) => {
      if (!h.days.includes(String(addDays(start, i).getDay())) || k < ymd(new Date(h.created_at)) || k > ymd(new Date())) return;
      planned++;
      if ((h.logs[k] ?? 0) >= h.target) hit++;
    });
  }

  const round = (n: number) => Math.round(n * 10) / 10;
  return json({
    start: ymd(start),
    end: ymd(addDays(end, -1)),
    days: days.map((d) => ({ ...d, busyHours: round(d.busyHours), taskHours: round(d.taskHours) })),
    done,
    open,
    projects: projects.filter((p) => p.status === "active"),
    habitRate: planned ? hit / planned : null,
    moodAvg: moods.length ? round(moods.reduce((a, m) => a + m.mood, 0) / moods.length) : null,
    focusTotal: focus.reduce((a, f) => a + f.minutes, 0),
    note: note?.content ?? "",
  });
});

/** Haftalık not */
export const PUT = route(async (req) => {
  const b = await body<{ offset?: number; note?: string }>(req);
  const { start } = await weekRange(addDays(new Date(), (b.offset ?? 0) * 7));
  await run(
    `INSERT INTO journal (date, content, updated_at) VALUES (@date, @content, @ts)
     ON CONFLICT (user_id, date) DO UPDATE SET content = @content, updated_at = @ts`,
    { date: noteKey(start), content: b.note ?? "", ts: nowIso() },
  );
  return json({ ok: true });
});
