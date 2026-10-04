import { addDays, all, run, ymd } from "./db";
import { createEvent, deleteEvent, listEvents } from "./events";
import { dayWindow, getSettings } from "./settings";
import { PRIORITY_GOOGLE_COLOR, TIME_PREFS, type Task } from "./types";

type Slot = { start: number; end: number };
const MIN = 60_000;
const STEP = 15 * MIN;
const ceilStep = (ms: number) => Math.ceil(ms / STEP) * STEP;

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
  const start = ceilStep(fromMs);
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
  return slots.map((sl) => ({ start: ceilStep(sl.start), end: sl.end })).filter((sl) => sl.end - sl.start >= STEP);
}

export type PlannedBlock = { taskId: string; title: string; start: string; end: string; late: boolean; part?: string };
export type PlanResult = {
  planned: PlannedBlock[];
  /** Tamamen ya da kısmen yerleşemeyen işler; kalan dakikalarıyla */
  unplanned: { taskId: string; title: string; minutesLeft: number }[];
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
 * Akıllı planlama v2 (Motion / Sunsama esinli):
 *  - Görevler: günün en önemli işleri → bugüne seçilenler → son tarih → öncelik sırasıyla yerleşir.
 *  - Parçalama: chunk_min dolu bir iş, o uzunlukta bloklara bölünür ve mümkünse farklı günlere dağıtılır.
 *  - Günlük sınır: bir güne konan görev bloklarının toplamı dailyMaxMinutes'ı aşmaz.
 *  - Zaman tercihi: sabah / öğleden sonra / akşam penceresi önce denenir, olmazsa herhangi bir saat.
 *  - Son tarih: önce son tarihten önceki boşluklar; hiç yoksa sonrası ("geç" olarak işaretlenir).
 */
export async function autoPlan(opts: PlanOptions = {}): Promise<PlanResult> {
  const s = await getSettings();
  const now = Date.now();
  const today = ymd(new Date());
  const horizon = opts.days ?? s.planDays;

  if (opts.replan) {
    const auto = await all<{ id: string }>(
      `SELECT e.id FROM events e JOIN tasks t ON t.id = e.task_id
       WHERE e.deleted = 0 AND e.start_ms > ? AND t.status = 'todo'`,
      [now],
    );
    for (const a of auto) await deleteEvent(a.id).catch(() => {});
  }

  let tasks = await all<Task & { scheduled: number }>(
    `SELECT t.*, (SELECT (COALESCE(SUM(e.end_ms - e.start_ms), 0) / 60000)::int FROM events e WHERE e.task_id = t.id AND e.deleted = 0) AS scheduled
     FROM tasks t WHERE t.status = 'todo'`,
  );
  if (opts.taskIds?.length) tasks = tasks.filter((t) => opts.taskIds!.includes(t.id));
  // Alt görevi olan ana görevleri değil, alt görevleri planla.
  const parents = new Set(tasks.filter((t) => t.parent_id).map((t) => t.parent_id));
  tasks = tasks.filter((t) => !parents.has(t.id) && t.duration_min - Number(t.scheduled) >= 5);
  const rank = (t: Task) => (t.top_date === today ? 0 : t.planned_date && t.planned_date <= today ? 1 : 2);
  tasks.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.due ?? "9999").localeCompare(b.due ?? "9999") ||
      a.priority - b.priority ||
      a.created_at.localeCompare(b.created_at),
  );

  const slots = await freeSlots(now, horizon);
  const result: PlanResult = { planned: [], unplanned: [] };
  const buffer = s.bufferMin * MIN;
  const dailyMax = (s.dailyMaxMinutes || 0) * MIN;

  // Her güne halihazırda konmuş görev blokları (günlük sınır için)
  const load = new Map<string, number>();
  const horizonEnd = addDays(new Date(now), horizon).getTime();
  for (const e of await listEvents(now - 864e5, horizonEnd)) {
    if (!e.task_id || e.all_day) continue;
    const k = ymd(new Date(e.start_ms));
    load.set(k, (load.get(k) ?? 0) + (e.end_ms - e.start_ms));
  }

  /** Bir boşluğun, verilen gün içi pencereyle kesişimi */
  const clip = (sl: Slot, pref: Task["time_pref"]): Slot => {
    if (!pref) return sl;
    const day = new Date(sl.start);
    const w = TIME_PREFS[pref];
    const from = new Date(day).setHours(w.from, 0, 0, 0);
    const to = w.to >= 24 ? new Date(day).setHours(23, 59, 0, 0) : new Date(day).setHours(w.to, 0, 0, 0);
    return { start: ceilStep(Math.max(sl.start, from)), end: Math.min(sl.end, to) };
  };

  for (const t of tasks) {
    let remaining = (t.duration_min - Number(t.scheduled)) * MIN;
    const chunk = t.chunk_min ? t.chunk_min * MIN : remaining;
    const totalParts = Math.max(1, Math.ceil(remaining / chunk));
    const deadline = t.due ? addDays(new Date(`${t.due}T00:00:00`), 1).getTime() : Infinity;
    const usedDays = new Set<string>();
    let part = 0;
    let firstEventId: string | null = null;

    while (remaining >= 5 * MIN) {
      // Son parça çok kısa kalmasın: 15 dakikanın altındaysa öncekine eklenir.
      let len = Math.min(chunk, remaining);
      if (remaining - len > 0 && remaining - len < STEP) len = remaining;

      // Kısıtları sırayla gevşet: (gün dağıtımı, zaman tercihi, son tarih). Günlük sınır her zaman korunur.
      const passes = [
        { spread: true, pref: true, beforeDue: true },
        { spread: false, pref: true, beforeDue: true },
        { spread: false, pref: false, beforeDue: true },
        { spread: false, pref: false, beforeDue: false },
      ];
      let found: { idx: number; win: Slot; late: boolean } | null = null;
      for (const p of passes) {
        for (let i = 0; i < slots.length; i++) {
          const win = clip(slots[i], p.pref ? t.time_pref : null);
          if (win.end - win.start < len) continue;
          const k = ymd(new Date(win.start));
          if (p.spread && t.chunk_min && usedDays.has(k)) continue;
          if (p.beforeDue && win.start + len > deadline) continue;
          if (dailyMax && (load.get(k) ?? 0) + len > dailyMax) continue;
          found = { idx: i, win, late: win.start + len > deadline };
          break;
        }
        if (found) break;
      }
      if (!found) break;

      const start = found.win.start;
      const end = start + len;
      part++;
      const partLabel = totalParts > 1 ? `${part}/${totalParts}` : undefined;
      const ev = await createEvent({
        title: partLabel ? `${t.title} (${partLabel})` : t.title,
        description: `${t.notes ? `${t.notes}\n\n` : ""}Planlayıcı tarafından otomatik planlandı.`,
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        colorId: PRIORITY_GOOGLE_COLOR[t.priority] ?? null,
        taskId: t.id,
        reminderMin: s.reminderMin,
      });
      firstEventId ??= ev.id;

      // Kullanılan kısmı boşluktan çıkar (pencere yüzünden ortadan kesildiyse iki parçaya böl)
      const sl = slots[found.idx];
      const pieces: Slot[] = [];
      if (start - buffer - sl.start >= STEP) pieces.push({ start: sl.start, end: start - buffer });
      const rest = ceilStep(end + buffer);
      if (sl.end - rest >= STEP) pieces.push({ start: rest, end: sl.end });
      slots.splice(found.idx, 1, ...pieces);

      const k = ymd(new Date(start));
      load.set(k, (load.get(k) ?? 0) + len);
      usedDays.add(k);
      remaining -= len;
      result.planned.push({
        taskId: t.id,
        title: t.title,
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        late: found.late,
        part: partLabel,
      });
    }

    if (firstEventId) await run("UPDATE tasks SET event_id = ? WHERE id = ?", [firstEventId, t.id]);
    if (remaining >= 5 * MIN) result.unplanned.push({ taskId: t.id, title: t.title, minutesLeft: Math.round(remaining / MIN) });
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
    `SELECT e.id AS event_id, t.id AS task_id FROM events e JOIN tasks t ON t.id = e.task_id
     WHERE e.deleted = 0 AND t.status = 'todo' AND e.end_ms < ? AND e.end_ms > ?`,
    [now, now - 7 * 864e5],
  );
  if (!missed.length) return { planned: [], unplanned: [], moved: 0 };
  for (const m of missed) {
    try {
      await deleteEvent(m.event_id);
    } catch {
      // Salt okunur takvimdeki bir blok taşınamaz; bağlantıyı koparıp yeniden planla.
      await run("UPDATE events SET task_id = NULL WHERE id = ?", [m.event_id]);
    }
  }
  const r = await autoPlan({ taskIds: [...new Set(missed.map((m) => m.task_id))] });
  return { ...r, moved: missed.length };
}
