import { all, get, ymd } from "./db";
import { getSettings } from "./settings";

/** Bugünün özeti: en önemli işler ve odak hedefi (Bugün sayfasındaki halka için). */
export type Progress = {
  today: {
    topTotal: number;
    topDone: number;
    tasksDone: number;
    focusMinutes: number;
    focusGoal: number;
    /** 0–1 arası: en önemli işler + odak hedefi */
    score: number;
    planned: boolean;
  };
};

export async function getProgress(): Promise<Progress> {
  const today = ymd(new Date());
  const dayStart = new Date(`${today}T00:00:00`).toISOString();
  const [tops, done, focus, plan, settings] = await Promise.all([
    all<{ status: string }>("SELECT status FROM tasks WHERE top_date = ? AND parent_id IS NULL", [today]),
    all<{ completed_at: string }>("SELECT completed_at FROM tasks WHERE status = 'done' AND completed_at >= ?", [dayStart]),
    all<{ minutes: number }>("SELECT minutes FROM focus_sessions WHERE abandoned = 0 AND started_at >= ?", [dayStart]),
    get<{ planned_at: string | null }>("SELECT planned_at FROM daily_plans WHERE date = ?", [today]),
    getSettings(),
  ]);
  const focusMinutes = focus.reduce((a, f) => a + f.minutes, 0);
  const focusGoal = Math.max(15, settings.dailyFocusGoal || 120);
  const topDone = tops.filter((t) => t.status === "done").length;
  const parts = [Math.min(1, focusMinutes / focusGoal)];
  if (tops.length) parts.unshift(topDone / tops.length);
  return {
    today: {
      topTotal: tops.length,
      topDone,
      tasksDone: done.filter((t) => ymd(new Date(t.completed_at)) === today).length,
      focusMinutes,
      focusGoal,
      score: parts.reduce((a, b) => a + b, 0) / parts.length,
      planned: Boolean(plan?.planned_at),
    },
  };
}
