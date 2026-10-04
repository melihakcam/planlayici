import { addDays, all, batch, get, nowIso, ymd } from "@/lib/db";
import { deleteEvent, listEvents } from "@/lib/events";
import { listHabits } from "@/lib/habits";
import { body, json, route } from "@/lib/http";
import { getProgress } from "@/lib/progress";
import { listTasks, updateTask } from "@/lib/tasks";

export const dynamic = "force-dynamic";

/** Akşam kapanışı için gün özeti: yapılanlar, kalanlar, odak, alışkanlıklar, yarının önizlemesi. */
export const GET = route(async () => {
  const today = ymd(new Date());
  const tomorrow = ymd(addDays(new Date(), 1));
  const t0 = new Date(`${tomorrow}T00:00:00`);
  const [tasks, progress, habits, plan, tomorrowEvents] = await Promise.all([
    listTasks(),
    getProgress(),
    listHabits(),
    get<{ closed_at: string | null; reflection: string }>("SELECT closed_at, reflection FROM daily_plans WHERE date = ?", [today]),
    listEvents(t0.getTime(), addDays(t0, 1).getTime()),
  ]);
  const top = tasks.filter((t) => !t.parent_id);
  const done = top.filter((t) => t.status === "done" && t.completed_at && ymd(new Date(t.completed_at)) === today);
  // Bugüne ait olup yapılmayanlar: bugüne seçilen, en önemli, son tarihi bugün/geçmiş ya da bugün bloğu olan
  const left = top.filter(
    (t) =>
      t.status === "todo" &&
      (t.planned_date === today || t.top_date === today || (t.due && t.due <= today) || (t.event_start && ymd(new Date(t.event_start)) === today)),
  );
  const weekday = String(new Date().getDay());
  return json({
    date: today,
    closedAt: plan?.closed_at ?? null,
    reflection: plan?.reflection ?? "",
    done,
    left,
    progress,
    habits: habits
      .filter((h) => h.days.includes(weekday))
      .map((h) => ({ id: h.id, name: h.name, icon: h.icon, done: (h.logs[today] ?? 0) >= h.target })),
    tomorrow: {
      events: tomorrowEvents.map((e) => ({ id: e.id, title: e.title, start: e.start, end: e.end, all_day: e.all_day, task_id: e.task_id })),
      due: top.filter((t) => t.status === "todo" && t.due === tomorrow).map((t) => ({ id: t.id, title: t.title })),
    },
  });
});

/**
 * Günü kapatır: kalan işler için kararları uygular (yarın / sonra / yapıldı),
 * yansıma notunu ve ruh halini kaydeder.
 */
export const POST = route(async (req) => {
  const b = await body<{ reflection?: string; mood?: number | null; moves?: { id: string; action: "tomorrow" | "later" | "done" }[] }>(req);
  const today = ymd(new Date());
  const tomorrow = ymd(addDays(new Date(), 1));
  for (const m of b.moves ?? []) {
    if (m.action === "done") await updateTask(m.id, { status: "done" });
    else if (m.action === "tomorrow") await updateTask(m.id, { planned_date: tomorrow, top_date: null });
    else if (m.action === "later") await updateTask(m.id, { planned_date: null, top_date: null });
  }
  const ts = nowIso();
  const stmts = [
    {
      sql: `INSERT INTO daily_plans (date, closed_at, reflection) VALUES (@date, @ts, @reflection)
            ON CONFLICT (user_id, date) DO UPDATE SET closed_at = @ts, reflection = @reflection`,
      args: { date: today, ts, reflection: (b.reflection ?? "").slice(0, 4000) },
    },
  ];
  if (b.mood) {
    stmts.push({
      sql: `INSERT INTO journal (date, content, mood, updated_at) VALUES (@date, '', @mood, @ts)
            ON CONFLICT (user_id, date) DO UPDATE SET mood = @mood, updated_at = @ts`,
      args: { date: today, mood: Math.min(5, Math.max(1, Number(b.mood))), ts } as never,
    });
  }
  await batch(stmts);
  // Yarına/sonraya taşınan işlerin bugün yapılmadan geçen blokları "kaçırılan iş" uyarısı olarak dönmesin.
  const moved = (b.moves ?? []).filter((m) => m.action !== "done").map((m) => m.id);
  if (moved.length) {
    const dayStart = new Date(`${today}T00:00:00`).getTime();
    const stale = await all<{ id: string }>(
      `SELECT id FROM events WHERE deleted = 0 AND end_ms < ? AND start_ms >= ? AND task_id IN (${moved.map(() => "?").join(",")})`,
      [Date.now(), dayStart, ...moved],
    );
    for (const e of stale) await deleteEvent(e.id).catch(() => {});
  }
  return json({ ok: true });
});
