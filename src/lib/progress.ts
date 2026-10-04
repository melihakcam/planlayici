import { addDays, all, ymd } from "./db";
import { getSettings } from "./settings";

import { levelFromXp, levelTitle, XP } from "./xp";

/**
 * Motivasyon sistemi: XP, seviye, seri ve günlük hedef. Kurallar: xp.ts.
 * XP ayrı bir tabloda tutulmaz; geçmiş kayıtlardan her seferinde hesaplanır (tutarlı ve geri alınabilir).
 */
export type Progress = {
  xp: number;
  xpToday: number;
  level: number;
  levelTitle: string;
  levelCurrent: number;
  levelNeeded: number;
  streak: number;
  activeToday: boolean;
  today: {
    topTotal: number;
    topDone: number;
    tasksDone: number;
    focusMinutes: number;
    focusGoal: number;
    /** 0–1 arası günlük ilerleme: en önemli işler + odak hedefi */
    score: number;
    planned: boolean;
    closed: boolean;
  };
  /** Son 14 gün: o gün kazanılan XP (ısı çizgisi için) */
  recent: { date: string; xp: number; active: boolean }[];
};

export async function getProgress(): Promise<Progress> {
  const today = ymd(new Date());
  const [tasks, focus, habits, plans, tops, settings] = await Promise.all([
    all<{ duration_min: number; priority: number; completed_at: string; top_date: string | null }>(
      "SELECT duration_min, priority, completed_at, top_date FROM tasks WHERE status = 'done' AND completed_at IS NOT NULL",
    ),
    all<{ started_at: string; minutes: number; abandoned: number }>("SELECT started_at, minutes, abandoned FROM focus_sessions"),
    all<{ date: string; count: number; target: number }>(
      "SELECT l.date, l.count, h.target FROM habit_logs l JOIN habits h ON h.id = l.habit_id",
    ),
    all<{ date: string; planned_at: string | null; closed_at: string | null }>(
      "SELECT date, planned_at, closed_at FROM daily_plans",
    ),
    all<{ status: string }>("SELECT status FROM tasks WHERE top_date = ? AND parent_id IS NULL", [today]),
    getSettings(),
  ]);

  const byDay = new Map<string, number>();
  const active = new Set<string>();
  const add = (date: string, xp: number, isActive = true) => {
    byDay.set(date, (byDay.get(date) ?? 0) + xp);
    if (isActive) active.add(date);
  };

  for (const t of tasks) {
    const d = ymd(new Date(t.completed_at));
    add(d, XP.task(t.duration_min, t.priority, t.top_date === d));
  }
  let focusToday = 0;
  for (const f of focus) {
    if (f.abandoned) continue;
    const d = ymd(new Date(f.started_at));
    add(d, f.minutes * XP.focusMinute);
    if (d === today) focusToday += f.minutes;
  }
  for (const h of habits) if (h.count >= h.target) add(h.date, XP.habit);
  let plannedToday = false;
  let closedToday = false;
  for (const p of plans) {
    if (p.planned_at) add(p.date, XP.plan);
    if (p.closed_at) add(p.date, XP.close);
    if (p.date === today) {
      plannedToday = Boolean(p.planned_at);
      closedToday = Boolean(p.closed_at);
    }
  }

  const xp = [...byDay.values()].reduce((a, b) => a + b, 0);
  const lv = levelFromXp(xp);

  // Seri: bugünden (bugün henüz boşsa dünden) geriye kesintisiz aktif gün sayısı
  let streak = 0;
  let d = new Date();
  if (!active.has(ymd(d))) d = addDays(d, -1);
  while (active.has(ymd(d))) {
    streak++;
    d = addDays(d, -1);
  }

  const tasksDoneToday = tasks.filter((t) => ymd(new Date(t.completed_at)) === today).length;
  const topDone = tops.filter((t) => t.status === "done").length;
  const focusGoal = Math.max(15, settings.dailyFocusGoal || 120);
  const parts = [Math.min(1, focusToday / focusGoal)];
  if (tops.length) parts.unshift(topDone / tops.length);
  const score = parts.reduce((a, b) => a + b, 0) / parts.length;

  return {
    xp,
    xpToday: byDay.get(today) ?? 0,
    level: lv.level,
    levelTitle: levelTitle(lv.level),
    levelCurrent: lv.current,
    levelNeeded: lv.needed,
    streak,
    activeToday: active.has(today),
    today: {
      topTotal: tops.length,
      topDone,
      tasksDone: tasksDoneToday,
      focusMinutes: focusToday,
      focusGoal,
      score,
      planned: plannedToday,
      closed: closedToday,
    },
    recent: Array.from({ length: 14 }, (_, i) => {
      const k = ymd(addDays(new Date(), i - 13));
      return { date: k, xp: byDay.get(k) ?? 0, active: active.has(k) };
    }),
  };
}
