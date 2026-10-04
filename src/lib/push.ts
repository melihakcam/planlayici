import webpush from "web-push";
import { addDays, all, get, nowIso, parseYmd, run, ymd } from "./db";
import { getSettings } from "./settings";

/**
 * Telefon bildirimleri (Web Push). Dış bir zamanlayıcı (cron-job.org) /api/tick'i
 * 5 dakikada bir çağırır; o ana kadar zamanı gelmiş bildirimler gönderilir.
 * Her bildirim push_log'a anahtarıyla yazılır, böylece aynı şey iki kez gitmez.
 */
const M = 60_000;
/** Zamanlayıcı gecikse bile kaçırılmasın diye geriye dönük bakılan süre */
const LOOKBACK = 12 * M;

export const pushReady = () => Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

function configure() {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:planlayici@example.com",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
}

type Sub = { endpoint: string; p256dh: string; auth: string };
export type PushMessage = { title: string; body: string; url?: string; tag?: string };

export async function subscribe(s: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  await run(
    `INSERT INTO push_subscriptions (endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
    [s.endpoint, s.keys.p256dh, s.keys.auth, nowIso()],
  );
}

export const unsubscribe = (endpoint: string) => run("DELETE FROM push_subscriptions WHERE endpoint = ?", [endpoint]);

/** Tüm kayıtlı cihazlara gönderir; süresi dolmuş abonelikleri siler. */
export async function sendToAll(msg: PushMessage) {
  configure();
  const subs = await all<Sub>("SELECT endpoint, p256dh, auth FROM push_subscriptions");
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), {
        TTL: 3600,
      });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await unsubscribe(s.endpoint);
    }
  }
  return sent;
}

/** Anahtar daha önce kullanılmadıysa kaydeder ve true döner (aynı bildirim iki kez gitmesin). */
async function claim(key: string) {
  const r = await all<{ key: string }>(
    "INSERT INTO push_log (key, sent_at) VALUES (?, ?) ON CONFLICT (key) DO NOTHING RETURNING key",
    [key, nowIso()],
  );
  return r.length > 0;
}

const at = (date: string, hhmm: string) => {
  const d = parseYmd(date);
  const [h, m] = hhmm.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d.getTime();
};
const due = (t: number, now: number) => t <= now && t > now - LOOKBACK;
const hm = (ms: number) => new Date(ms).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

/** Şu an gönderilmesi gereken bildirimleri bulur ve yollar. */
export async function tick(now = Date.now()) {
  const s = await getSettings();
  const n = s.notify;
  const today = ymd(new Date(now));
  const tomorrow = ymd(addDays(new Date(now), 1));
  const out: (PushMessage & { key: string })[] = [];

  // 1) Takvim: oturum başlangıcı, ders/kurs öncesi, diğer etkinlikler öncesi
  const events = await all<{
    id: string;
    title: string;
    location: string;
    start_ms: number;
    end_ms: number;
    calendar_id: string;
    series_id: string | null;
  }>(
    `SELECT e.id, e.title, e.location, e.start_ms, e.end_ms, e.calendar_id, e.series_id
     FROM events e JOIN calendars c ON c.id = e.calendar_id
     WHERE e.deleted = 0 AND e.all_day = 0 AND c.selected = 1 AND e.start_ms > ? AND e.start_ms < ?`,
    [now - LOOKBACK, now + 120 * M],
  );
  for (const e of events) {
    const isSession = e.series_id?.startsWith("oturum:");
    const isClass = e.calendar_id === "local:okul" || e.calendar_id === "local:kurs";
    const before = isSession ? (n.sessions ? 0 : -1) : isClass ? n.classesMin || -1 : n.eventsMin || -1;
    if (before < 0) continue;
    if (!due(e.start_ms - before * M, now)) continue;
    const min = Math.round((e.end_ms - e.start_ms) / M);
    out.push(
      isSession
        ? { key: `ev:${e.id}:${e.start_ms}`, title: `Oturum başladı: ${e.title}`, body: `${min} dakika odaklan. Bitince ${hm(e.end_ms)}'te mola.`, url: "/odak", tag: e.id }
        : {
            key: `ev:${e.id}:${e.start_ms}`,
            title: `${before} dk sonra: ${e.title}`,
            body: `${hm(e.start_ms)}–${hm(e.end_ms)}${e.location ? ` · ${e.location}` : ""}`,
            url: "/takvim",
            tag: e.id,
          },
    );
  }

  // 2) Son tarihler: önceki akşam 20:00 ve o gün 09:00
  if (n.deadlines) {
    const slots = [
      { when: at(today, "20:00"), date: tomorrow, label: "Yarın son gün" },
      { when: at(today, "09:00"), date: today, label: "Bugün son gün" },
    ].filter((x) => due(x.when, now));
    for (const slot of slots) {
      const [tasks, projects] = await Promise.all([
        all<{ id: string; title: string }>("SELECT id, title FROM tasks WHERE status = 'todo' AND due = ?", [slot.date]),
        all<{ id: string; name: string }>("SELECT id, name FROM projects WHERE status = 'active' AND deadline = ?", [slot.date]),
      ]);
      const names = [...projects.map((p) => p.name), ...tasks.map((t) => t.title)];
      if (names.length)
        out.push({
          key: `due:${slot.date}:${slot.label}`,
          title: `${slot.label}: ${names.length === 1 ? names[0] : `${names.length} iş`}`,
          body: names.slice(0, 5).join(" · "),
          url: "/gorevler",
          tag: `due-${slot.date}`,
        });
    }
  }

  // 3) "Yarını planla" — yarın için henüz oturum yerleştirilmediyse
  if (n.planTime && due(at(today, n.planTime), now)) {
    const plan = await get<{ planned_at: string | null }>("SELECT planned_at FROM daily_plans WHERE date = ?", [tomorrow]);
    if (!plan?.planned_at)
      out.push({ key: `plan:${tomorrow}`, title: "Yarını planlayalım", body: "Yarın kaçta boşsun, neye çalışacaksın? 1 dakikanı al.", url: "/planla", tag: "plan" });
  }

  // 4) Alışkanlıklar: belirlenen saat aralığında, hedefe ulaşılana kadar N dakikada bir
  const habits = await all<{ id: string; name: string; days: string; target: number; remind_every: number; remind_start: string; remind_end: string; count: number | null }>(
    `SELECT h.id, h.name, h.days, h.target, h.remind_every, h.remind_start, h.remind_end, l.count
     FROM habits h LEFT JOIN habit_logs l ON l.habit_id = h.id AND l.date = ?
     WHERE h.archived = 0 AND h.remind_every IS NOT NULL`,
    [today],
  );
  const weekday = String(new Date(now).getDay());
  for (const h of habits) {
    if (!h.days.includes(weekday) || (h.count ?? 0) >= h.target) continue;
    const start = at(today, h.remind_start);
    let end = at(today, h.remind_end);
    if (end <= start) end += 24 * 60 * M;
    if (now < start || now > end) continue;
    // Başlangıçtan itibaren her "remind_every" dakikada bir hatırlatma dilimi
    const slot = Math.floor((now - start) / (h.remind_every * M));
    if (now - (start + slot * h.remind_every * M) > LOOKBACK) continue;
    out.push({
      key: `habit:${h.id}:${today}:${slot}`,
      title: h.name,
      body: h.target > 1 ? `Bugün ${h.count ?? 0}/${h.target}. Yaptıysan işaretlemeyi unutma.` : "Hatırlatma: yaptıysan işaretle.",
      url: "/aliskanliklar",
      tag: `habit-${h.id}`,
    });
  }

  let sent = 0;
  for (const m of out) {
    if (!(await claim(m.key))) continue;
    sent += await sendToAll(m);
  }
  // Eski gönderim kayıtlarını temizle
  if (new Date(now).getMinutes() < 5) await run("DELETE FROM push_log WHERE sent_at < ?", [new Date(now - 3 * 864e5).toISOString()]);
  return { due: out.length, sent };
}
