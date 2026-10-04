import { getCalendar, isLocalCalendar, isWritable, listCalendars, syncCalendarList } from "./calendars";
import { addDays, all, batch, get, nowIso, parseYmd, run, uid, ymd, type Args } from "./db";
import { getAccount, getAccountRow, gfetch, GoogleError, setAccountField } from "./google";
import { getSettings } from "./settings";
import type { EventRow } from "./types";

export type EventInput = {
  title?: string;
  description?: string;
  location?: string;
  start?: string;
  end?: string;
  allDay?: boolean;
  colorId?: string | null;
  reminderMin?: number | null;
  taskId?: string | null;
  calendarId?: string | null;
  /** Yalnızca oluştururken: daily | weekly | monthly | yearly */
  repeat?: string | null;
  /** Tekrar sayısı; boşsa süresiz */
  repeatCount?: number | null;
  /** Haftalık tekrarda günler (0 = Pazar); ör. [1,2,3,4] = Pzt–Per */
  repeatDays?: number[] | null;
  /** Bu tarihe kadar (dahil) tekrarla — YYYY-MM-DD */
  repeatUntil?: string | null;
};

const getRow = (id: string) => get<EventRow>("SELECT * FROM events WHERE id = ?", [id]);
const calPath = (calendarId: string) => `/calendars/${encodeURIComponent(calendarId)}/events`;
const gone = (err: unknown) => err instanceof GoogleError && (err.status === 404 || err.status === 410);

/** Başlangıç/bitişi normalize eder ve sorgu için milisaniye değerlerini üretir. */
function normalizeTimes(start: string, end: string | undefined | null, allDay: boolean, defaultMin = 60) {
  if (allDay) {
    const s = start.slice(0, 10);
    let e = end ? end.slice(0, 10) : ymd(addDays(parseYmd(s), 1));
    if (e <= s) e = ymd(addDays(parseYmd(s), 1));
    return { start: s, end: e, start_ms: parseYmd(s).getTime(), end_ms: parseYmd(e).getTime() };
  }
  const sd = new Date(start);
  if (isNaN(sd.getTime())) throw new Error("Geçersiz başlangıç tarihi");
  let ed = end ? new Date(end) : new Date(sd.getTime() + defaultMin * 60_000);
  if (isNaN(ed.getTime()) || ed <= sd) ed = new Date(sd.getTime() + 30 * 60_000);
  return { start: sd.toISOString(), end: ed.toISOString(), start_ms: sd.getTime(), end_ms: ed.getTime() };
}

/** Etkinlikler, takvim rengi/adı ve yazılabilirlik bilgisiyle birlikte. */
export function listEvents(fromMs: number, toMs: number) {
  return all<EventRow>(
    `SELECT e.*, c.color AS calendar_color, c.summary AS calendar_name,
       CASE WHEN c.access_role IN ('reader', 'freeBusyReader') THEN 0 ELSE 1 END AS writable
     FROM events e LEFT JOIN calendars c ON c.id = e.calendar_id
     WHERE e.deleted = 0 AND e.start_ms < ? AND e.end_ms > ? ORDER BY e.start_ms`,
    [toMs, fromMs],
  );
}

export function getEvent(id: string) {
  return getRow(id);
}

type NewRow = Omit<EventRow, "created_at" | "updated_at" | "deleted">;

function insertStmt(row: NewRow): { sql: string; args: Args } {
  const ts = nowIso();
  return {
    sql: `INSERT INTO events (id, calendar_id, title, description, location, start, "end", start_ms, end_ms, all_day, color_id,
      reminder_min, google_id, recurring_event_id, recurrence, series_id, task_id, dirty, deleted, created_at, updated_at)
     VALUES (@id, @calendar_id, @title, @description, @location, @start, @end, @start_ms, @end_ms, @all_day, @color_id,
      @reminder_min, @google_id, @recurring_event_id, @recurrence, @series_id, @task_id, @dirty, 0, @ts, @ts)`,
    args: { ...row, ts },
  };
}

/** Varsayılan takvim senkrondan çıkarılmış ya da salt okunursa, seçili ilk yazılabilir takvime düşer. */
async function defaultCalendarId(preferred: string) {
  // Yerel takvimler (ör. ders programı) yalnızca açıkça seçilirse varsayılan olur.
  const cals = (await listCalendars()).filter((c) => !isLocalCalendar(c.id) || c.id === preferred);
  if (!cals.length) return preferred || "primary";
  const usable = cals.filter((c) => c.selected && c.access_role !== "reader" && c.access_role !== "freeBusyReader");
  return (usable.find((c) => c.id === preferred) ?? usable.find((c) => c.is_primary) ?? usable[0])?.id ?? preferred;
}

async function assertWritable(calendarId: string) {
  if (!(await isWritable(calendarId))) {
    const c = await getCalendar(calendarId);
    throw new Error(`"${c?.summary ?? calendarId}" takvimi salt okunur`);
  }
}

const FREQ: Record<string, string> = { daily: "DAILY", weekly: "WEEKLY", monthly: "MONTHLY", yearly: "YEARLY" };
const LOCAL_REPEAT_CAP: Record<string, number> = { daily: 90, weekly: 52, monthly: 24, yearly: 10 };

const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

type RepeatRule = { freq: string; count: number | null; until: Date | null; days: number[] | null };

/** Tekrar kuralının yerel örneklerinin başlangıçları (çevrimdışı ya da yerel takvim için). */
function occurrences(start: string, allDay: boolean, r: RepeatRule): string[] {
  const first = allDay ? parseYmd(start) : new Date(start);
  const cap = r.count ?? (r.until ? 1000 : LOCAL_REPEAT_CAP[r.freq]);
  const out: string[] = [];
  const fmt = (d: Date) => (allDay ? ymd(d) : d.toISOString());
  if (r.freq === "weekly" && r.days?.length) {
    // Seçili günler: başlangıçtan itibaren gün gün ilerle (en fazla ~2 yıl)
    for (let i = 0; i < 800 && out.length < cap; i++) {
      const d = new Date(first);
      d.setDate(d.getDate() + i);
      if (r.until && d > r.until) break;
      if (r.days.includes(d.getDay())) out.push(fmt(d));
    }
    return out;
  }
  for (let i = 0; out.length < cap && i < 1000; i++) {
    const d = new Date(first);
    if (r.freq === "daily") d.setDate(d.getDate() + i);
    if (r.freq === "weekly") d.setDate(d.getDate() + 7 * i);
    if (r.freq === "monthly") d.setMonth(d.getMonth() + i);
    if (r.freq === "yearly") d.setFullYear(d.getFullYear() + i);
    if (r.until && d > r.until) break;
    out.push(fmt(d));
  }
  return out;
}

/** Google için RRULE metni */
function rrule(r: RepeatRule, allDay: boolean) {
  let rule = `RRULE:FREQ=${FREQ[r.freq]}`;
  if (r.freq === "weekly" && r.days?.length) rule += `;BYDAY=${r.days.map((d) => BYDAY[d]).join(",")}`;
  if (r.until) {
    const u = r.until.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    rule += `;UNTIL=${allDay ? ymd(r.until).replace(/-/g, "") : u}`;
  } else if (r.count) rule += `;COUNT=${r.count}`;
  return rule;
}

export async function createEvent(input: EventInput): Promise<EventRow> {
  if (!input.start) throw new Error("Başlangıç zorunlu");
  const settings = await getSettings();
  const calendarId = input.calendarId || (await defaultCalendarId(settings.planCalendarId));
  await assertWritable(calendarId);
  const allDay = Boolean(input.allDay);
  const t = normalizeTimes(input.start, input.end, allDay, settings.defaultDuration);
  const base = {
    calendar_id: calendarId,
    title: input.title?.trim() || "(Başlıksız)",
    description: input.description ?? "",
    location: input.location ?? "",
    all_day: allDay ? 1 : 0,
    color_id: input.colorId ?? null,
    reminder_min: input.reminderMin ?? null,
    google_id: null,
    recurring_event_id: null,
    task_id: input.taskId ?? null,
    // Yerel takvim etkinlikleri hiçbir yere gönderilmeyeceği için "bekleyen" sayılmaz.
    dirty: isLocalCalendar(calendarId) ? 0 : 1,
  };
  const id = uid();
  const repeat = input.repeat && FREQ[input.repeat] ? input.repeat : null;
  // Yerel takvimdeki tekrarlar Google'a gitmez; yerelde tek tek oluşturulur.
  const connected = Boolean(await getAccount()) && !isLocalCalendar(calendarId);
  const days = repeat === "weekly" && input.repeatDays?.length ? [...new Set(input.repeatDays.map(Number))].filter((d) => d >= 0 && d <= 6).sort() : null;
  const untilDay = input.repeatUntil && /^\d{4}-\d{2}-\d{2}$/.test(input.repeatUntil) ? parseYmd(input.repeatUntil) : null;
  if (untilDay) untilDay.setHours(23, 59, 59, 0);
  const rule: RepeatRule | null = repeat
    ? { freq: repeat, count: input.repeatCount ? Math.min(366, Number(input.repeatCount)) : null, until: untilDay, days }
    : null;

  // Seçili günlerle tekrar: ilk örnek seçili günlerden birine denk gelmeli (Google ve RFC 5545 için).
  if (rule?.days) {
    const firstStart = occurrences(t.start, allDay, { ...rule, count: 1 })[0];
    if (firstStart && firstStart !== t.start) {
      const dur = t.end_ms - t.start_ms;
      Object.assign(
        t,
        allDay
          ? normalizeTimes(firstStart, ymd(new Date(parseYmd(firstStart).getTime() + dur)), true)
          : normalizeTimes(firstStart, new Date(new Date(firstStart).getTime() + dur).toISOString(), false),
      );
    }
  }

  if (rule && connected) {
    // Google tekrar kuralını yönetir; örnekler senkronla geri gelir.
    const s = insertStmt({ id, ...base, ...t, recurrence: rrule(rule, allDay), series_id: null });
    await run(s.sql, s.args);
    await pushEvent(id);
    const gid = (await getRow(id))?.google_id;
    if (!gid) return (await getRow(id))!; // gönderilemedi; sonraki senkronda tekrar denenecek
    // Tüm takvimi yeniden çekmek yerine yalnızca bu serinin örneklerini al.
    await pullInstances(calendarId, id, gid).catch((e) => console.error("[tekrar örnekleri]", e));
    return (
      (await getRow(id)) ??
      (await get<EventRow>("SELECT * FROM events WHERE recurring_event_id = ? ORDER BY start_ms LIMIT 1", [gid]))!
    );
  }

  if (rule) {
    // Çevrimdışı ya da yerel takvim: tekrarları tek tek etkinlik olarak oluştur.
    const seriesId = uid();
    const dur = t.end_ms - t.start_ms;
    const stmts = [];
    const starts = occurrences(t.start, allDay, rule);
    for (let i = 0; i < starts.length; i++) {
      const s = starts[i];
      const n = allDay
        ? normalizeTimes(s, ymd(new Date(parseYmd(s).getTime() + dur)), true)
        : normalizeTimes(s, new Date(new Date(s).getTime() + dur).toISOString(), false);
      stmts.push(insertStmt({ id: i === 0 ? id : uid(), ...base, ...n, recurrence: null, series_id: seriesId }));
    }
    await batch(stmts);
    return (await getRow(id))!;
  }

  const s = insertStmt({ id, ...base, ...t, recurrence: null, series_id: null });
  await batch([
    s,
    ...(input.taskId ? [{ sql: "UPDATE tasks SET event_id = ? WHERE id = ?", args: [id, input.taskId] }] : []),
  ]);
  await pushEvent(id);
  return (await getRow(id))!;
}

export async function updateEvent(id: string, input: EventInput): Promise<EventRow> {
  const cur = await getRow(id);
  if (!cur || cur.deleted) throw new Error("Etkinlik bulunamadı");
  await assertWritable(cur.calendar_id);

  // Başka takvime taşıma
  let calendarId = cur.calendar_id;
  if (input.calendarId && input.calendarId !== cur.calendar_id) {
    if (cur.recurring_event_id || cur.series_id || cur.recurrence) {
      throw new Error("Tekrarlayan etkinlikler başka takvime taşınamaz");
    }
    await assertWritable(input.calendarId);
    if (cur.google_id && (await getAccount())) {
      if (isLocalCalendar(input.calendarId)) {
        // Google'dan yerel takvime: Google'daki kopyayı sil, yerelde kalsın.
        try {
          await gfetch(`${calPath(cur.calendar_id)}/${encodeURIComponent(cur.google_id)}`, { method: "DELETE" });
        } catch (e) {
          if (!gone(e)) throw e;
        }
        await run("UPDATE events SET google_id = NULL WHERE id = ?", [id]);
      } else {
        await gfetch(
          `${calPath(cur.calendar_id)}/${encodeURIComponent(cur.google_id)}/move?destination=${encodeURIComponent(input.calendarId)}`,
          { method: "POST" },
        );
      }
    }
    // Yerelden Google takvimine taşınan etkinlik, google_id olmadığı için pushEvent'te yeni oluşturulur.
    calendarId = input.calendarId;
  }

  const allDay = input.allDay ?? Boolean(cur.all_day);
  const timesChanged = input.start !== undefined || input.end !== undefined || input.allDay !== undefined;
  const t = timesChanged
    ? normalizeTimes(input.start ?? cur.start, input.end ?? (input.allDay !== undefined ? undefined : cur.end), allDay)
    : { start: cur.start, end: cur.end, start_ms: cur.start_ms, end_ms: cur.end_ms };
  await run(
    `UPDATE events SET calendar_id=@calendar_id, title=@title, description=@description, location=@location, start=@start,
      "end"=@end, start_ms=@start_ms, end_ms=@end_ms, all_day=@all_day, color_id=@color_id, reminder_min=@reminder_min,
      dirty=1, updated_at=@ts WHERE id=@id`,
    {
      id,
      calendar_id: calendarId,
      title: input.title !== undefined ? input.title.trim() || "(Başlıksız)" : cur.title,
      description: input.description ?? cur.description,
      location: input.location ?? cur.location,
      ...t,
      all_day: allDay ? 1 : 0,
      color_id: input.colorId !== undefined ? input.colorId : cur.color_id,
      reminder_min: input.reminderMin !== undefined ? input.reminderMin : cur.reminder_min,
      ts: nowIso(),
    },
  );
  await pushEvent(id);
  return (await getRow(id))!;
}

const hardDeleteStmts = (id: string) => [
  { sql: "UPDATE tasks SET event_id = NULL WHERE event_id = ?", args: [id] },
  { sql: "DELETE FROM events WHERE id = ?", args: [id] },
];
const hardDelete = (id: string) => batch(hardDeleteStmts(id));

/** series=true: tekrarlayan etkinliğin tüm serisini siler. */
export async function deleteEvent(id: string, series = false) {
  const cur = await getRow(id);
  if (!cur) return;
  await assertWritable(cur.calendar_id);
  if (series && cur.recurring_event_id) {
    if (await getAccount()) {
      try {
        await gfetch(`${calPath(cur.calendar_id)}/${encodeURIComponent(cur.recurring_event_id)}`, { method: "DELETE" });
      } catch (e) {
        if (!gone(e)) throw e;
      }
    }
    const rows = await all<{ id: string }>("SELECT id FROM events WHERE recurring_event_id = ? AND calendar_id = ?", [
      cur.recurring_event_id,
      cur.calendar_id,
    ]);
    await batch(rows.flatMap((r) => hardDeleteStmts(r.id)));
    return;
  }
  const ids =
    series && cur.series_id
      ? (await all<{ id: string }>("SELECT id FROM events WHERE series_id = ?", [cur.series_id])).map((r) => r.id)
      : [id];
  await run(`UPDATE events SET deleted = 1, dirty = 1, updated_at = ? WHERE id IN (${ids.map(() => "?").join(",")})`, [
    nowIso(),
    ...ids,
  ]);
  for (const i of ids) await pushEvent(i);
}

// ---------------------------------------------------------------------------
// Google senkronu
// ---------------------------------------------------------------------------

type GDate = { date?: string; dateTime?: string; timeZone?: string };
type GEvent = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: GDate;
  end?: GDate;
  colorId?: string;
  recurringEventId?: string;
  recurrence?: string[];
  reminders?: { useDefault?: boolean; overrides?: { method: string; minutes: number }[] };
};

function toGoogle(e: EventRow, tz: string) {
  const isNew = !e.google_id;
  const body: Record<string, unknown> = {
    summary: e.title,
    description: e.description,
    location: e.location,
    // PATCH'te tür değişimi (tüm gün ↔ saatli) için karşı alan null gönderilir.
    start: e.all_day
      ? { date: e.start, ...(isNew ? {} : { dateTime: null }) }
      : { dateTime: e.start, timeZone: tz, ...(isNew ? {} : { date: null }) },
    end: e.all_day
      ? { date: e.end, ...(isNew ? {} : { dateTime: null }) }
      : { dateTime: e.end, timeZone: tz, ...(isNew ? {} : { date: null }) },
    reminders:
      e.reminder_min != null
        ? { useDefault: false, overrides: [{ method: "popup", minutes: e.reminder_min }] }
        : { useDefault: true },
  };
  if (e.color_id || !isNew) body.colorId = e.color_id;
  if (e.recurrence && isNew) body.recurrence = [e.recurrence];
  return body;
}

/** Tek bir yerel değişikliği Google'a gönderir. Başarısız olursa dirty=1 kalır ve sonraki senkronda tekrar denenir. */
export async function pushEvent(id: string) {
  const e = await getRow(id);
  if (!e) return;
  // Yerel takvimler Google'a hiç gönderilmez.
  if (isLocalCalendar(e.calendar_id)) {
    if (e.deleted) await hardDelete(id);
    else if (e.dirty) await run("UPDATE events SET dirty = 0 WHERE id = ?", [id]);
    return;
  }
  if (!(await getAccount())) {
    if (e.deleted) await hardDelete(id);
    return;
  }
  try {
    const tz = (await getSettings()).timeZone;
    const base = calPath(e.calendar_id);
    if (e.deleted) {
      if (e.google_id) {
        try {
          await gfetch(`${base}/${encodeURIComponent(e.google_id)}`, { method: "DELETE" });
        } catch (err) {
          if (!gone(err)) throw err;
        }
      }
      await hardDelete(id);
      return;
    }
    if (e.google_id) {
      try {
        await gfetch(`${base}/${encodeURIComponent(e.google_id)}`, {
          method: "PATCH",
          body: JSON.stringify(toGoogle(e, tz)),
        });
      } catch (err) {
        // Google'da silinmişse yerel kopyayı da kaldır.
        if (gone(err)) return hardDelete(id);
        throw err;
      }
      await run("UPDATE events SET dirty = 0 WHERE id = ? AND updated_at = ?", [id, e.updated_at]);
    } else {
      const g = await gfetch<GEvent>(base, { method: "POST", body: JSON.stringify(toGoogle(e, tz)) });
      await run("UPDATE events SET google_id = ?, dirty = 0 WHERE id = ?", [g.id, id]);
    }
  } catch (err) {
    await setAccountField({ last_error: (err as Error).message });
    console.error("[google push]", (err as Error).message);
  }
}

function fromGoogle(g: GEvent) {
  const allDay = Boolean(g.start?.date);
  const start = allDay ? g.start!.date! : g.start!.dateTime!;
  const end = allDay ? g.end?.date : g.end?.dateTime;
  return {
    title: g.summary || "(Başlıksız)",
    description: g.description ?? "",
    location: g.location ?? "",
    ...normalizeTimes(start, end, allDay),
    all_day: allDay ? 1 : 0,
    color_id: g.colorId ?? null,
    reminder_min: g.reminders?.useDefault === false ? (g.reminders.overrides?.[0]?.minutes ?? null) : null,
    recurring_event_id: g.recurringEventId ?? null,
  };
}

const PULL_PAST_DAYS = 60;
const PULL_FUTURE_DAYS = 400;

/** Yeni oluşturulan tekrarlayan bir etkinliğin örneklerini çeker ve yerel ana kaydın yerine koyar. */
async function pullInstances(calendarId: string, localId: string, googleId: string) {
  const timeMin = addDays(new Date(), -PULL_PAST_DAYS);
  const timeMax = addDays(new Date(), PULL_FUTURE_DAYS);
  const items: GEvent[] = [];
  let pageToken: string | undefined;
  do {
    const q = new URLSearchParams({
      maxResults: "2500",
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      ...(pageToken ? { pageToken } : {}),
    });
    const res = await gfetch<{ items: GEvent[]; nextPageToken?: string }>(
      `${calPath(calendarId)}/${encodeURIComponent(googleId)}/instances?${q}`,
    );
    items.push(...(res.items || []));
    pageToken = res.nextPageToken;
  } while (pageToken);
  const live = items.filter((g) => g.status !== "cancelled" && g.start);
  if (!live.length) return;
  await batch([
    ...hardDeleteStmts(localId),
    ...live.map((g) =>
      insertStmt({
        id: uid(),
        calendar_id: calendarId,
        ...fromGoogle(g),
        recurring_event_id: g.recurringEventId ?? googleId,
        google_id: g.id,
        recurrence: null,
        series_id: null,
        task_id: null,
        dirty: 0,
      }),
    ),
  ]);
}

async function fetchCalendarEvents(calendarId: string, timeMin: Date, timeMax: Date) {
  const items: GEvent[] = [];
  let pageToken: string | undefined;
  do {
    const q = new URLSearchParams({
      singleEvents: "true",
      maxResults: "2500",
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      ...(pageToken ? { pageToken } : {}),
    });
    const res = await gfetch<{ items: GEvent[]; nextPageToken?: string }>(`${calPath(calendarId)}?${q}`);
    items.push(...(res.items || []));
    pageToken = res.nextPageToken;
  } while (pageToken);
  return items;
}

/** Seçili Google takvimlerindeki etkinlikleri belirli bir pencere içinde yerel veritabanına çeker. */
export async function pullFromGoogle() {
  await syncCalendarList();
  const calendars = (await listCalendars()).filter((c) => c.selected && !isLocalCalendar(c.id));
  const timeMin = addDays(new Date(), -PULL_PAST_DAYS);
  const timeMax = addDays(new Date(), PULL_FUTURE_DAYS);

  const fetched = new Map<string, GEvent[]>();
  const errors: string[] = [];
  for (const c of calendars) {
    try {
      fetched.set(c.id, await fetchCalendarEvents(c.id, timeMin, timeMax));
    } catch (e) {
      errors.push(`${c.summary}: ${(e as Error).message}`);
    }
  }

  // Yerel Google kayıtlarını tek sorguda al, farkları hesapla, tek toplu işlemde yaz.
  const local = await all<EventRow>("SELECT * FROM events WHERE google_id IS NOT NULL");
  const key = (cal: string, gid: string) => `${cal}\n${gid}`;
  const byKey = new Map(local.map((e) => [key(e.calendar_id, e.google_id!), e]));
  const seen = new Set<string>();
  const stmts: { sql: string; args?: Args }[] = [];
  const ts = nowIso();

  for (const [calendarId, items] of fetched) {
    for (const g of items) {
      if (g.status === "cancelled" || !g.start) continue;
      const k = key(calendarId, g.id);
      seen.add(k);
      const data = fromGoogle(g);
      const cur = byKey.get(k);
      if (!cur) {
        stmts.push(
          insertStmt({
            id: uid(),
            calendar_id: calendarId,
            ...data,
            google_id: g.id,
            recurrence: null,
            series_id: null,
            task_id: null,
            dirty: 0,
          }),
        );
      } else if (
        !cur.dirty &&
        (cur.title !== data.title ||
          cur.description !== data.description ||
          cur.location !== data.location ||
          cur.start !== data.start ||
          cur.end !== data.end ||
          cur.all_day !== data.all_day ||
          cur.color_id !== data.color_id ||
          cur.reminder_min !== data.reminder_min ||
          cur.recurring_event_id !== data.recurring_event_id)
      ) {
        stmts.push({
          sql: `UPDATE events SET title=@title, description=@description, location=@location, start=@start, "end"=@end,
            start_ms=@start_ms, end_ms=@end_ms, all_day=@all_day, color_id=@color_id, reminder_min=@reminder_min,
            recurring_event_id=@recurring_event_id, updated_at=@ts WHERE id=@id`,
          args: { ...data, id: cur.id, ts },
        });
      }
    }
  }
  // Başarıyla çekilen takvimlerde, pencere içinde olup Google'da artık bulunmayanları (silinmiş) kaldır.
  for (const e of local) {
    if (
      fetched.has(e.calendar_id) &&
      !e.dirty &&
      !seen.has(key(e.calendar_id, e.google_id!)) &&
      e.start_ms < timeMax.getTime() &&
      e.end_ms > timeMin.getTime()
    ) {
      stmts.push(...hardDeleteStmts(e.id));
    }
  }
  await batch(stmts);
  if (errors.length) throw new Error(`Bazı takvimler alınamadı — ${errors.join("; ")}`);
}

let running: Promise<void> | null = null;

/** Önce bekleyen yerel değişiklikleri gönderir, sonra Google'dan çeker. */
export function syncNow() {
  if (!running) {
    running = (async () => {
      if (!(await getAccount())) return;
      const dirty = await all<{ id: string }>("SELECT id FROM events WHERE dirty = 1 AND calendar_id NOT LIKE 'local:%'");
      for (const d of dirty) await pushEvent(d.id);
      await pullFromGoogle();
      const left = (await get<{ n: number }>("SELECT COUNT(*) AS n FROM events WHERE dirty = 1 AND calendar_id NOT LIKE 'local:%'"))!.n;
      await setAccountField({ last_sync: nowIso(), ...(left === 0 ? { last_error: null } : {}) });
    })()
      .catch(async (e) => {
        if (await getAccountRow()) await setAccountField({ last_error: (e as Error).message });
        throw e;
      })
      .finally(() => {
        running = null;
      });
  }
  return running;
}
