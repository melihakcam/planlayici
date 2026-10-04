import { addDays, all, run, ymd } from "./db";
import { createEvent, deleteEvent, listEvents } from "./events";
import { dayWindow, getSettings } from "./settings";
import { PRIORITY_GOOGLE_COLOR, type Task } from "./types";

type Slot = { start: number; end: number };
const MIN = 60_000;
const STEP = 15 * MIN;

function atTime(day: Date, hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(day);
  d.setHours(h, m || 0, 0, 0);
  return d.getTime();
}

/** Planlama pencereleri içindeki boş zaman aralıkları (bugünden itibaren `days` gün). */
export async function freeSlots(fromMs: number, days: number): Promise<Slot[]> {
  const s = await getSettings();
  const buffer = s.bufferMin * MIN;
  const until = addDays(new Date(fromMs), days).getTime();
  const busy = (await listEvents(fromMs, until))
    .filter((e) => !e.all_day)
    .map((e) => ({ start: e.start_ms - buffer, end: e.end_ms + buffer }))
    .sort((a, b) => a.start - b.start);

  const slots: Slot[] = [];
  const start = Math.ceil(fromMs / STEP) * STEP;
  for (let i = 0; i < Math.max(1, days); i++) {
    const day = addDays(new Date(fromMs), i);
    const win = dayWindow(s, day.getDay());
    if (!win) continue;
    let ws = Math.max(atTime(day, win.start), start);
    const we = atTime(day, win.end);
    if (ws >= we) continue;
    for (const b of busy) {
      if (b.end <= ws || b.start >= we) continue;
      if (b.start > ws) slots.push({ start: ws, end: b.start });
      ws = Math.max(ws, b.end);
    }
    if (we > ws) slots.push({ start: ws, end: we });
  }
  // Başlangıçları 15 dakikaya yuvarla
  return slots
    .map((sl) => ({ start: Math.ceil(sl.start / STEP) * STEP, end: sl.end }))
    .filter((sl) => sl.end - sl.start >= STEP);
}

export type PlanResult = {
  planned: { taskId: string; title: string; start: string; end: string; late: boolean }[];
  unplanned: { taskId: string; title: string }[];
};

export type PlanOptions = {
  /** Gelecekteki otomatik blokları silip yeniden dağıt */
  replan?: boolean;
  /** Yalnızca bu görevleri planla */
  taskIds?: string[];
  /** Kaç gün ileriye planlanacak (varsayılan: ayarlardaki planDays) */
  days?: number;
};

/**
 * Akıllı planlama: planlanmamış görevleri sıralayıp takvimdeki ilk uygun boşluğa yerleştirir.
 * Sıra: günün en önemli işleri → bugüne seçilenler → son tarih → öncelik.
 */
export async function autoPlan(opts: PlanOptions = {}): Promise<PlanResult> {
  const s = await getSettings();
  const now = Date.now();
  const today = ymd(new Date());

  if (opts.replan) {
    const auto = await all<{ id: string }>(
      `SELECT e.id FROM events e JOIN tasks t ON t.event_id = e.id
       WHERE e.task_id IS NOT NULL AND e.deleted = 0 AND e.start_ms > ? AND t.status = 'todo'`,
      [now],
    );
    for (const a of auto) await deleteEvent(a.id);
  }

  let tasks = await all<Task>(
    `SELECT * FROM tasks WHERE status = 'todo'
       AND (event_id IS NULL OR event_id NOT IN (SELECT id FROM events WHERE deleted = 0))`,
  );
  if (opts.taskIds?.length) tasks = tasks.filter((t) => opts.taskIds!.includes(t.id));
  // Alt görevi olan ana görevleri değil, alt görevleri planla.
  const parents = new Set(tasks.filter((t) => t.parent_id).map((t) => t.parent_id));
  tasks = tasks.filter((t) => !parents.has(t.id));
  const rank = (t: Task) => (t.top_date === today ? 0 : t.planned_date && t.planned_date <= today ? 1 : 2);
  tasks.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.due ?? "9999").localeCompare(b.due ?? "9999") ||
      a.priority - b.priority ||
      a.created_at.localeCompare(b.created_at),
  );

  const slots = await freeSlots(now, opts.days ?? s.planDays);
  const result: PlanResult = { planned: [], unplanned: [] };
  const buffer = s.bufferMin * MIN;

  for (const t of tasks) {
    const need = t.duration_min * MIN;
    const deadline = t.due ? addDays(new Date(`${t.due}T00:00:00`), 1).getTime() : Infinity;
    let idx = slots.findIndex((sl) => sl.end - sl.start >= need && sl.start + need <= deadline);
    let late = false;
    if (idx < 0) {
      idx = slots.findIndex((sl) => sl.end - sl.start >= need);
      late = idx >= 0 && deadline !== Infinity;
    }
    if (idx < 0) {
      result.unplanned.push({ taskId: t.id, title: t.title });
      continue;
    }
    const sl = slots[idx];
    const start = sl.start;
    const end = start + need;
    const ev = await createEvent({
      title: t.title,
      description: `${t.notes ? `${t.notes}\n\n` : ""}Planlayıcı tarafından otomatik planlandı.`,
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      colorId: PRIORITY_GOOGLE_COLOR[t.priority] ?? null,
      taskId: t.id,
      reminderMin: s.reminderMin,
    });
    await run("UPDATE tasks SET event_id = ? WHERE id = ?", [ev.id, t.id]);
    // Kullanılan kısmı boşluktan düş
    const rest = Math.ceil((end + buffer) / STEP) * STEP;
    if (sl.end - rest >= STEP) slots[idx] = { start: rest, end: sl.end };
    else slots.splice(idx, 1);
    result.planned.push({
      taskId: t.id,
      title: t.title,
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      late,
    });
  }
  return result;
}

/**
 * Plan kaydığında: bitiş saati geçmiş ama görevi tamamlanmamış zaman bloklarını kaldırır
 * ve o görevleri bir sonraki uygun boşluğa yeniden yerleştirir.
 */
export async function catchUp(): Promise<PlanResult & { moved: number }> {
  const now = Date.now();
  const missed = await all<{ event_id: string; task_id: string }>(
    `SELECT e.id AS event_id, t.id AS task_id FROM events e JOIN tasks t ON t.event_id = e.id
     WHERE e.task_id = t.id AND e.deleted = 0 AND t.status = 'todo' AND e.end_ms < ? AND e.end_ms > ?`,
    [now, now - 7 * 864e5],
  );
  if (!missed.length) return { planned: [], unplanned: [], moved: 0 };
  for (const m of missed) {
    try {
      await deleteEvent(m.event_id);
    } catch {
      // Salt okunur takvimdeki bir blok taşınamaz; görev bağlantısını koparıp yeniden planla.
      await run("UPDATE tasks SET event_id = NULL WHERE id = ?", [m.task_id]);
    }
  }
  const r = await autoPlan({ taskIds: missed.map((m) => m.task_id) });
  return { ...r, moved: missed.length };
}
