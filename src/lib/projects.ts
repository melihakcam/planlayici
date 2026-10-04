import { addDays, all, batch, get, nowIso, run, uid } from "./db";
import { getSettings } from "./settings";
import type { Area, Project, ProjectStats } from "./types";

const AREA_KEYS: Area[] = ["yazilim", "is", "okul", "kisisel"];
const H = 3_600_000;

/** Ayarlardaki haftanın ilk gününe göre bu haftanın başlangıcı (yerel gece yarısı). */
export async function weekRange(ref = new Date()) {
  const { weekStart } = await getSettings();
  const start = new Date(ref);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() - weekStart + 7) % 7));
  return { start, end: addDays(start, 7) };
}

export async function listProjectStats(ref = new Date()): Promise<ProjectStats[]> {
  const { start, end } = await weekRange(ref);
  const now = Date.now();
  const [projects, counts, blocks, focus] = await Promise.all([
    all<Project>("SELECT * FROM projects ORDER BY status, created_at"),
    all<{ project_id: string; status: string; n: number; next_due: string | null }>(
      `SELECT project_id, status, COUNT(*) AS n, MIN(due) AS next_due FROM tasks
       WHERE project_id IS NOT NULL AND parent_id IS NULL GROUP BY project_id, status`,
    ),
    all<{ project_id: string; start_ms: number; end_ms: number }>(
      `SELECT t.project_id, e.start_ms, e.end_ms FROM events e JOIN tasks t ON t.id = e.task_id
       WHERE e.deleted = 0 AND t.project_id IS NOT NULL AND e.start_ms < ? AND e.end_ms > ?`,
      [end.getTime(), start.getTime()],
    ),
    all<{ project_id: string; minutes: number }>(
      `SELECT t.project_id, f.minutes FROM focus_sessions f JOIN tasks t ON t.id = f.task_id
       WHERE t.project_id IS NOT NULL AND f.started_at >= ? AND f.started_at < ?`,
      [start.toISOString(), end.toISOString()],
    ),
  ]);

  return projects.map((p) => {
    const mine = counts.filter((c) => c.project_id === p.id);
    const open = mine.find((c) => c.status === "todo");
    let blockDone = 0;
    let planned = 0;
    for (const b of blocks.filter((b) => b.project_id === p.id)) {
      const s = Math.max(b.start_ms, start.getTime());
      const e = Math.min(b.end_ms, end.getTime());
      blockDone += Math.max(0, Math.min(e, now) - s);
      planned += Math.max(0, e - Math.max(s, now));
    }
    const focusMs = focus.filter((f) => f.project_id === p.id).reduce((a, f) => a + f.minutes * 60_000, 0);
    // Odak oturumları genelde zaman bloklarının içinde yapılır; çift saymamak için büyüğünü al.
    const doneMs = Math.max(blockDone, focusMs);
    return {
      ...p,
      weekly_hours: Number(p.weekly_hours) || 0,
      open_tasks: open?.n ?? 0,
      done_tasks: mine.find((c) => c.status === "done")?.n ?? 0,
      next_due: open?.next_due ?? null,
      week_done_h: Math.round((doneMs / H) * 10) / 10,
      week_planned_h: Math.round((planned / H) * 10) / 10,
    };
  });
}

export type ProjectInput = Partial<Pick<Project, "name" | "color" | "area" | "status" | "deadline" | "weekly_hours" | "notes">>;

function clean(input: ProjectInput) {
  return {
    area: AREA_KEYS.includes(input.area as Area) ? input.area : undefined,
    status: ["active", "paused", "done"].includes(input.status ?? "") ? input.status : undefined,
    weekly_hours: input.weekly_hours !== undefined ? Math.max(0, Math.min(80, Number(input.weekly_hours) || 0)) : undefined,
  };
}

export async function createProject(input: ProjectInput) {
  const id = uid();
  const c = clean(input);
  await run(
    `INSERT INTO projects (id, name, color, area, status, deadline, weekly_hours, notes, created_at)
     VALUES (@id, @name, @color, @area, @status, @deadline, @weekly_hours, @notes, @created_at)`,
    {
      id,
      name: input.name?.trim() || "Yeni proje",
      color: input.color || "#6366f1",
      area: c.area ?? "kisisel",
      status: c.status ?? "active",
      deadline: input.deadline || null,
      weekly_hours: c.weekly_hours ?? 0,
      notes: input.notes ?? "",
      created_at: nowIso(),
    },
  );
  return get<Project>("SELECT * FROM projects WHERE id = ?", [id]);
}

export async function updateProject(id: string, input: ProjectInput) {
  const cur = await get<Project>("SELECT * FROM projects WHERE id = ?", [id]);
  if (!cur) throw new Error("Proje bulunamadı");
  const c = clean(input);
  await run(
    `UPDATE projects SET name=@name, color=@color, area=@area, status=@status, deadline=@deadline,
       weekly_hours=@weekly_hours, notes=@notes WHERE id=@id`,
    {
      id,
      name: input.name?.trim() || cur.name,
      color: input.color || cur.color,
      area: c.area ?? cur.area,
      status: c.status ?? cur.status,
      deadline: input.deadline !== undefined ? input.deadline || null : cur.deadline,
      weekly_hours: c.weekly_hours ?? cur.weekly_hours,
      notes: input.notes ?? cur.notes,
    },
  );
  return get<Project>("SELECT * FROM projects WHERE id = ?", [id]);
}

export async function deleteProject(id: string) {
  await batch([
    { sql: "UPDATE tasks SET project_id = NULL WHERE project_id = ?", args: [id] },
    { sql: "DELETE FROM projects WHERE id = ?", args: [id] },
  ]);
}
