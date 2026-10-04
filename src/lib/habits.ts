import { addDays, all, batch, get, nowIso, parseYmd, run, uid, ymd } from "./db";
import type { Habit } from "./types";

type HabitRow = Omit<Habit, "logs" | "streak">;

/** Bugünden geriye, planlanan günlerde hedefe ulaşılan ardışık gün sayısı. */
function streakOf(h: HabitRow, logs: Record<string, number>) {
  let streak = 0;
  let d = new Date();
  const created = parseYmd(ymd(new Date(h.created_at)));
  // Bugün henüz yapılmadıysa seriyi bozmaz.
  if (h.days.includes(String(d.getDay())) && (logs[ymd(d)] ?? 0) < h.target) d = addDays(d, -1);
  for (let i = 0; i < 3650 && d >= created; i++, d = addDays(d, -1)) {
    if (!h.days.includes(String(d.getDay()))) continue;
    if ((logs[ymd(d)] ?? 0) >= h.target) streak++;
    else break;
  }
  return streak;
}

export async function listHabits(includeArchived = false): Promise<Habit[]> {
  const rows = await all<HabitRow>(
    `SELECT * FROM habits ${includeArchived ? "" : "WHERE archived = 0"} ORDER BY created_at`,
  );
  const since = ymd(addDays(new Date(), -400));
  const logs = await all<{ habit_id: string; date: string; count: number }>(
    "SELECT habit_id, date, count FROM habit_logs WHERE date >= ?",
    [since],
  );
  const byHabit = new Map<string, Record<string, number>>();
  for (const l of logs) {
    const m = byHabit.get(l.habit_id) ?? {};
    m[l.date] = l.count;
    byHabit.set(l.habit_id, m);
  }
  return rows.map((h) => {
    const l = byHabit.get(h.id) ?? {};
    return { ...h, logs: l, streak: streakOf(h, l) };
  });
}

const HHMM = /^\d{2}:\d{2}$/;
/** Hatırlatma alanlarını doğrular: en az 15 dakikada bir, saat aralığı HH:MM */
function reminder(h: Partial<HabitRow>) {
  const every = Number(h.remind_every);
  return {
    remind_every: every > 0 ? Math.max(15, Math.round(every)) : null,
    remind_start: h.remind_start && HHMM.test(h.remind_start) ? h.remind_start : "09:00",
    remind_end: h.remind_end && HHMM.test(h.remind_end) ? h.remind_end : "23:00",
  };
}

export async function createHabit(input: Partial<HabitRow>) {
  const id = uid();
  await run(
    `INSERT INTO habits (id, name, icon, color, days, target, remind_every, remind_start, remind_end, created_at)
     VALUES (@id, @name, @icon, @color, @days, @target, @remind_every, @remind_start, @remind_end, @created_at)`,
    {
      id,
      name: input.name?.trim() || "Yeni alışkanlık",
      icon: input.icon || "✅",
      color: input.color || "#6366f1",
      days: input.days || "0123456",
      target: Math.max(1, Number(input.target) || 1),
      ...reminder(input),
      created_at: nowIso(),
    },
  );
  return id;
}

export async function updateHabit(id: string, input: Partial<HabitRow>) {
  const cur = await get<HabitRow>("SELECT * FROM habits WHERE id = ?", [id]);
  if (!cur) throw new Error("Alışkanlık bulunamadı");
  const n = { ...cur, ...input };
  await run(
    "UPDATE habits SET name=@name, icon=@icon, color=@color, days=@days, target=@target, archived=@archived, remind_every=@remind_every, remind_start=@remind_start, remind_end=@remind_end WHERE id=@id",
    {
      name: n.name,
      icon: n.icon,
      color: n.color,
      days: n.days,
      target: Math.max(1, Number(n.target) || 1),
      archived: n.archived ? 1 : 0,
      ...reminder(n),
      id,
    },
  );
}

export async function deleteHabit(id: string) {
  await batch([
    { sql: "DELETE FROM habit_logs WHERE habit_id = ?", args: [id] },
    { sql: "DELETE FROM habits WHERE id = ?", args: [id] },
  ]);
}

/** Bir günün sayacını ayarlar (count) veya artırır (delta). */
export async function logHabit(id: string, date: string, opts: { count?: number; delta?: number }) {
  const cur =
    (await get<{ count: number }>("SELECT count FROM habit_logs WHERE habit_id = ? AND date = ?", [id, date]))?.count ?? 0;
  const next = Math.max(0, opts.count ?? cur + (opts.delta ?? 1));
  await run(
    `INSERT INTO habit_logs (habit_id, date, count) VALUES (?, ?, ?)
     ON CONFLICT(habit_id, date) DO UPDATE SET count = excluded.count`,
    [id, date, next],
  );
  return next;
}
