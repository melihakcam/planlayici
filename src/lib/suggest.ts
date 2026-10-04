import { addDays, ymd } from "./db";
import { listProjectStats } from "./projects";
import { listTasks } from "./tasks";
import { PRIORITY_LABEL, type Suggestion } from "./types";

const PRIORITY_SCORE: Record<number, number> = { 1: 40, 2: 25, 3: 12, 4: 4 };

/**
 * Bugün için iş önerileri. Puan; öncelik, son tarihe yakınlık, projenin haftalık hedefin
 * gerisinde kalması ve proje teslim tarihine göre hesaplanır. Nedenler kullanıcıya gösterilir.
 */
export async function suggestTasks(limit = 15): Promise<Suggestion[]> {
  const [tasks, projects] = await Promise.all([listTasks(), listProjectStats()]);
  const today = ymd(new Date());
  const day = (n: number) => ymd(addDays(new Date(), n));
  const byId = new Map(projects.map((p) => [p.id, p]));

  const parents = new Set(tasks.filter((t) => t.parent_id && t.status === "todo").map((t) => t.parent_id));
  const candidates = tasks.filter(
    (t) =>
      t.status === "todo" &&
      !parents.has(t.id) &&
      // Bugünden sonraki bir güne zaten ayrılmış işler önerilmez.
      !(t.event_start && ymd(new Date(t.event_start)) > today) &&
      (!t.project_id || byId.get(t.project_id)?.status !== "paused"),
  );

  return candidates
    .map((task) => {
      const reasons: string[] = [];
      let score = PRIORITY_SCORE[task.priority] ?? 4;
      if (task.priority <= 2) reasons.push(PRIORITY_LABEL[task.priority]);

      if (task.due) {
        if (task.due < today) (score += 50), reasons.push("Gecikmiş");
        else if (task.due === today) (score += 40), reasons.push("Bugün teslim");
        else if (task.due === day(1)) (score += 25), reasons.push("Yarın teslim");
        else if (task.due <= day(3)) (score += 15), reasons.push("3 gün içinde teslim");
        else if (task.due <= day(7)) score += 7;
      }
      if (task.planned_date && task.planned_date <= today) (score += 20), reasons.push("Bugüne ayrılmış");

      const p = task.project_id ? byId.get(task.project_id) : undefined;
      if (p) {
        if (p.weekly_hours > 0) {
          const gap = Math.max(0, p.weekly_hours - p.week_done_h - p.week_planned_h);
          if (gap > 0) {
            score += Math.min(20, (gap / p.weekly_hours) * 20);
            reasons.push(`${p.name}: haftalık hedefin ${gap.toFixed(1)} sa gerisinde`);
          }
        }
        if (p.deadline && p.deadline <= day(7)) (score += 10), reasons.push(`${p.name} teslimi yakın`);
      }
      // Bekleyen işler zamanla öne çıksın
      score += Math.min(8, (Date.now() - Date.parse(task.created_at)) / 864e5);
      return { task, score: Math.round(score), reasons };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
