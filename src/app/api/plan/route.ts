import { addDays, all, batch, get, nowIso, ymd } from "@/lib/db";
import { deleteEvent, listEvents, syncNow } from "@/lib/events";
import { body, json, route } from "@/lib/http";
import { autoPlan, freeSlots } from "@/lib/scheduler";
import { suggestTasks } from "@/lib/suggest";
import { listTasks } from "@/lib/tasks";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Sabah planı için gereken her şey: dünden kalanlar, bugünün etkinlikleri, boş zaman, öneriler. */
export const GET = route(async (req) => {
  const today = ymd(new Date());
  const dayStart = new Date(`${today}T00:00:00`);

  // ?status=1 → ana sayfa için hızlı durum: bugün plan yapıldı mı, kaçırılan blok var mı
  if (new URL(req.url).searchParams.get("status")) {
    const [plan, missed] = await Promise.all([
      get<{ planned_at: string | null }>("SELECT planned_at FROM daily_plans WHERE date = ?", [today]),
      get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM events e JOIN tasks t ON t.event_id = e.id
         WHERE e.task_id = t.id AND e.deleted = 0 AND t.status = 'todo' AND e.end_ms < ? AND e.end_ms > ?`,
        [Date.now(), Date.now() - 7 * 864e5],
      ),
    ]);
    return json({ plannedAt: plan?.planned_at ?? null, missed: missed?.n ?? 0 });
  }

  await syncNow().catch(() => {});
  const [tasks, events, slots, suggestions, plan] = await Promise.all([
    listTasks(),
    listEvents(dayStart.getTime(), addDays(dayStart, 1).getTime()),
    freeSlots(Date.now(), 1),
    suggestTasks(20),
    get<{ planned_at: string | null }>("SELECT planned_at FROM daily_plans WHERE date = ?", [today]),
  ]);
  const todo = tasks.filter((t) => t.status === "todo" && !t.parent_id);
  // Dünden kalanlar: geçmişe ayrılmış ya da tarihi geçmiş ama yapılmamış işler
  const leftovers = todo.filter(
    (t) =>
      // Bugün ya da sonrasında zaten bir zaman bloğu olan iş "kalan" sayılmaz.
      !(t.event_start && Date.parse(t.event_start) >= dayStart.getTime()) &&
      ((t.planned_date && t.planned_date < today) ||
        (t.due && t.due < today) ||
        (t.event_end && Date.parse(t.event_end) < dayStart.getTime())),
  );
  return json({
    date: today,
    plannedAt: plan?.planned_at ?? null,
    leftovers,
    events: events.filter((e) => !e.task_id),
    taskBlocks: events.filter((e) => e.task_id),
    freeMinutes: Math.round(slots.reduce((a, s) => a + (s.end - s.start), 0) / 60_000),
    suggestions,
    today: todo.filter((t) => t.planned_date === today || t.top_date === today),
  });
});

/**
 * Sabah planını uygular: seçilen işleri bugüne ayırır, en önemli 3'ü işaretler ve
 * bugünün boş saatlerine yerleştirir.
 */
export const POST = route(async (req) => {
  const b = await body<{ taskIds?: string[]; topIds?: string[] }>(req);
  const today = ymd(new Date());
  const ids = [...new Set([...(b.topIds ?? []), ...(b.taskIds ?? [])])];
  const top = new Set((b.topIds ?? []).slice(0, 3));
  await batch([
    // Bugünkü önceki "en önemli" işaretlerini temizle
    { sql: "UPDATE tasks SET top_date = NULL WHERE top_date = ?", args: [today] },
    ...ids.map((id) => ({
      sql: "UPDATE tasks SET planned_date = ?, top_date = ? WHERE id = ?",
      args: [today, top.has(id) ? today : null, id],
    })),
    {
      sql: `INSERT INTO daily_plans (date, planned_at) VALUES (?, ?)
            ON CONFLICT (user_id, date) DO UPDATE SET planned_at = excluded.planned_at`,
      args: [today, nowIso()],
    },
  ]);
  // Bugüne seçilen ama başka bir güne planlanmış işlerin bloklarını kaldır; bugüne yerleşecekler.
  const dayStart = new Date(`${today}T00:00:00`).getTime();
  const dayEnd = addDays(new Date(`${today}T00:00:00`), 1).getTime();
  if (ids.length) {
    const elsewhere = await all<{ id: string }>(
      `SELECT e.id FROM events e JOIN tasks t ON t.event_id = e.id
       WHERE e.deleted = 0 AND e.start_ms >= ? AND t.id IN (${ids.map(() => "?").join(",")})`,
      [dayEnd, ...ids],
    );
    for (const e of elsewhere) await deleteEvent(e.id).catch(() => {});
  }
  // Zaten bugün zaman bloğu olan işler yeniden planlanmaz; olmayanlar bugünün boşluklarına yerleşir.
  const result = ids.length ? await autoPlan({ taskIds: ids, days: 1 }) : { planned: [], unplanned: [] };
  const scheduledToday = await all<{ id: string }>(
    `SELECT t.id FROM tasks t JOIN events e ON e.id = t.event_id
     WHERE e.deleted = 0 AND e.start_ms >= ? AND e.start_ms < ?`,
    [dayStart, dayEnd],
  );
  return json({ ...result, scheduledToday: scheduledToday.length });
});
