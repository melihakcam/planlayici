import { addDays, all, get, ymd } from "@/lib/db";
import { listHabits } from "@/lib/habits";
import { json, route } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const days = Math.min(90, Number(new URL(req.url).searchParams.get("days")) || 14);
  const start = addDays(new Date(), -(days - 1));
  start.setHours(0, 0, 0, 0);
  const keys = Array.from({ length: days }, (_, i) => ymd(addDays(start, i)));

  const [done, focus, events, habitList, open, overdue] = await Promise.all([
    all<{ completed_at: string }>("SELECT completed_at FROM tasks WHERE status = 'done' AND completed_at >= ?", [
      start.toISOString(),
    ]),
    all<{ started_at: string; minutes: number }>("SELECT started_at, minutes FROM focus_sessions WHERE started_at >= ?", [
      start.toISOString(),
    ]),
    all<{ start_ms: number; end_ms: number }>(
      "SELECT start_ms, end_ms FROM events WHERE deleted = 0 AND all_day = 0 AND start_ms >= ? AND start_ms < ?",
      [start.getTime(), addDays(start, days).getTime()],
    ),
    listHabits(),
    get<{ n: number }>("SELECT COUNT(*) AS n FROM tasks WHERE status = 'todo'"),
    get<{ n: number }>("SELECT COUNT(*) AS n FROM tasks WHERE status = 'todo' AND due < ?", [ymd(new Date())]),
  ]);

  const byDay = keys.map((k) => ({ date: k, tasks: 0, focus: 0, eventHours: 0, habits: 0, habitsPlanned: 0 }));
  const idx = new Map(keys.map((k, i) => [k, i]));
  for (const t of done) {
    const i = idx.get(ymd(new Date(t.completed_at)));
    if (i !== undefined) byDay[i].tasks++;
  }
  for (const f of focus) {
    const i = idx.get(ymd(new Date(f.started_at)));
    if (i !== undefined) byDay[i].focus += f.minutes;
  }
  for (const e of events) {
    const i = idx.get(ymd(new Date(e.start_ms)));
    if (i !== undefined) byDay[i].eventHours += (e.end_ms - e.start_ms) / 3_600_000;
  }

  const habits = habitList.map((h) => {
    let planned = 0;
    let hit = 0;
    keys.forEach((k, i) => {
      const d = addDays(start, i);
      if (!h.days.includes(String(d.getDay())) || k < ymd(new Date(h.created_at))) return;
      planned++;
      byDay[i].habitsPlanned++;
      if ((h.logs[k] ?? 0) >= h.target) {
        hit++;
        byDay[i].habits++;
      }
    });
    return { id: h.id, name: h.name, icon: h.icon, color: h.color, streak: h.streak, rate: planned ? hit / planned : 0 };
  });

  const totals = {
    tasks: byDay.reduce((a, d) => a + d.tasks, 0),
    focus: byDay.reduce((a, d) => a + d.focus, 0),
    eventHours: Math.round(byDay.reduce((a, d) => a + d.eventHours, 0) * 10) / 10,
    open: open?.n ?? 0,
    overdue: overdue?.n ?? 0,
  };
  return json({ days: byDay.map((d) => ({ ...d, eventHours: Math.round(d.eventHours * 10) / 10 })), habits, totals });
});
