import { all, get, nowIso, parseYmd, run, uid, ymd } from "./db";
import { deleteEvent, getEvent } from "./events";
import type { Task } from "./types";

export type TaskInput = Partial<
  Pick<Task, "title" | "notes" | "priority" | "due" | "duration_min" | "status" | "repeat" | "project_id" | "parent_id" | "planned_date" | "top_date">
>;

const SELECT = `SELECT t.*, e.start AS event_start, e."end" AS event_end, e.all_day AS event_all_day
  FROM tasks t LEFT JOIN events e ON e.id = t.event_id AND e.deleted = 0`;

export function listTasks(): Promise<Task[]> {
  return all<Task>(
    `${SELECT} ORDER BY t.status DESC, CASE WHEN t.due IS NULL THEN 1 ELSE 0 END, t.due, t.priority, t.created_at`,
  );
}

export function getTask(id: string) {
  return get<Task>(`${SELECT} WHERE t.id = ?`, [id]);
}

const clampPriority = (p: unknown) => Math.min(4, Math.max(1, Number(p) || 4));

export async function createTask(input: TaskInput): Promise<Task> {
  const id = uid();
  await run(
    `INSERT INTO tasks (id, title, notes, priority, due, duration_min, status, repeat, project_id, parent_id, planned_date, top_date, created_at)
     VALUES (@id, @title, @notes, @priority, @due, @duration_min, 'todo', @repeat, @project_id, @parent_id, @planned_date, @top_date, @created_at)`,
    {
      id,
      title: input.title?.trim() || "Yeni görev",
      notes: input.notes ?? "",
      priority: clampPriority(input.priority),
      due: input.due || null,
      duration_min: Math.max(5, Number(input.duration_min) || 30),
      repeat: input.repeat || null,
      project_id: input.project_id || null,
      parent_id: input.parent_id || null,
      planned_date: input.planned_date || null,
      top_date: input.top_date || null,
      created_at: nowIso(),
    },
  );
  return (await getTask(id))!;
}

function nextDue(due: string | null, repeat: string) {
  const d = due ? parseYmd(due) : new Date();
  const today = ymd(new Date());
  // Geçmişte kalan tekrarlar için bugüne ya da sonrasına kadar ilerle.
  do {
    if (repeat === "daily") d.setDate(d.getDate() + 1);
    else if (repeat === "weekly") d.setDate(d.getDate() + 7);
    else d.setMonth(d.getMonth() + 1);
  } while (ymd(d) < today);
  return ymd(d);
}

export async function updateTask(id: string, patch: TaskInput): Promise<Task> {
  const cur = await getTask(id);
  if (!cur) throw new Error("Görev bulunamadı");
  const next = { ...cur, ...patch };
  let completedAt = cur.completed_at;
  if (patch.status && patch.status !== cur.status) {
    completedAt = patch.status === "done" ? nowIso() : null;
  }
  await run(
    `UPDATE tasks SET title=@title, notes=@notes, priority=@priority, due=@due, duration_min=@duration_min,
      status=@status, repeat=@repeat, project_id=@project_id, planned_date=@planned_date, top_date=@top_date,
      completed_at=@completed_at WHERE id=@id`,
    {
      id,
      title: next.title?.trim() || cur.title,
      notes: next.notes ?? "",
      priority: clampPriority(next.priority),
      due: next.due || null,
      duration_min: Math.max(5, Number(next.duration_min) || 30),
      status: next.status === "done" ? "done" : "todo",
      repeat: next.repeat || null,
      project_id: next.project_id || null,
      planned_date: next.planned_date || null,
      top_date: next.top_date || null,
      completed_at: completedAt,
    },
  );
  // Tekrarlayan görev tamamlandığında bir sonrakini oluştur.
  if (patch.status === "done" && cur.status !== "done" && cur.repeat) {
    await createTask({
      title: cur.title,
      notes: cur.notes,
      priority: cur.priority,
      duration_min: cur.duration_min,
      repeat: cur.repeat,
      project_id: cur.project_id,
      due: nextDue(cur.due, cur.repeat),
    });
  }
  return (await getTask(id))!;
}

export async function deleteTask(id: string) {
  const subs = await all<{ id: string }>("SELECT id FROM tasks WHERE parent_id = ?", [id]);
  const ids = [id, ...subs.map((r) => r.id)];
  for (const tid of ids) {
    const t = await getTask(tid);
    // Gelecekteki otomatik planlanmış zaman bloğunu da kaldır.
    if (t?.event_id) {
      const ev = await getEvent(t.event_id);
      if (ev && ev.task_id === tid && ev.end_ms > Date.now()) await deleteEvent(ev.id);
    }
  }
  await run(
    `UPDATE focus_sessions SET task_id = NULL WHERE task_id IN (${ids.map(() => "?").join(",")})`,
    ids,
  );
  await run(`DELETE FROM tasks WHERE id IN (${ids.map(() => "?").join(",")})`, ids);
}
