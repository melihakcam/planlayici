import { all, batch } from "./db";

export type Settings = {
  workStart: string; // "09:00"
  workEnd: string; // "22:00"
  workDays: string; // "12345" (0 = Pazar)
  timeZone: string;
  defaultDuration: number;
  bufferMin: number;
  planDays: number;
  reminderMin: number;
  weekStart: number;
  pomodoroFocus: number;
  pomodoroBreak: number;
  pomodoroLong: number;
  /** Yeni etkinliklerin ve otomatik planlanan görevlerin yazılacağı takvim */
  planCalendarId: string;
  /**
   * Güne özel planlama saatleri (0 = Pazar). null olan gün planlanmaz; anahtar yoksa
   * workStart/workEnd/workDays kullanılır.
   */
  daySchedule: Record<string, { start: string; end: string } | null> | null;
  /** Yapılmadan geçen zaman bloklarını otomatik olarak sonraki boşluğa kaydır */
  autoReschedule: boolean;
  /** Bir güne yerleştirilecek görev bloklarının üst sınırı (dakika) — aşırı dolu günleri önler */
  dailyMaxMinutes: number;
  /** Günlük odak hedefi (dakika) — Bugün sayfasındaki halka */
  dailyFocusGoal: number;
  /** Dönem bilgisi: ders programı bu aralıkta, sınav haftaları hariç oluşturulur */
  semesterStart: string | null;
  semesterEnd: string | null;
  examWeeks: { name: string; start: string; end: string; skipClasses: boolean }[];
  /** Telefon bildirimleri */
  notify: {
    /** Çalışma oturumu başlarken */
    sessions: boolean;
    /** Ders ve kurstan kaç dakika önce (0 = kapalı) */
    classesMin: number;
    /** Diğer takvim etkinliklerinden kaç dakika önce (0 = kapalı) */
    eventsMin: number;
    /** Son tarihler: önceki akşam 20:00 ve o gün 09:00 */
    deadlines: boolean;
    /** "Yarını planla" hatırlatma saati ("" = kapalı) */
    planTime: string;
  };
};

export const DEFAULT_SETTINGS: Settings = {
  workStart: "09:00",
  workEnd: "22:00",
  workDays: "0123456",
  timeZone: process.env.APP_TIMEZONE || "Europe/Istanbul",
  defaultDuration: 60,
  bufferMin: 10,
  planDays: 7,
  reminderMin: 10,
  weekStart: 1,
  pomodoroFocus: 25,
  pomodoroBreak: 5,
  pomodoroLong: 15,
  planCalendarId: "primary",
  daySchedule: null,
  autoReschedule: false,
  dailyMaxMinutes: 240,
  dailyFocusGoal: 120,
  semesterStart: null,
  semesterEnd: null,
  examWeeks: [],
  notify: { sessions: true, classesMin: 10, eventsMin: 10, deadlines: true, planTime: "22:15" },
};

/** Bir günün planlama penceresi; o gün planlanmayacaksa null. */
export function dayWindow(s: Settings, weekday: number): { start: string; end: string } | null {
  const custom = s.daySchedule?.[String(weekday)];
  if (s.daySchedule && String(weekday) in s.daySchedule) return custom ?? null;
  return s.workDays.includes(String(weekday)) ? { start: s.workStart, end: s.workEnd } : null;
}

export async function getSettings(): Promise<Settings> {
  const rows = await all<{ key: string; value: string }>("SELECT key, value FROM settings");
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if (r.key in DEFAULT_SETTINGS) out[r.key] = JSON.parse(r.value);
  }
  // Saat dilimi sunucu ortamından gelir (APP_TIMEZONE); sunucu hesaplarıyla tutarlı kalmalı.
  out.timeZone = DEFAULT_SETTINGS.timeZone;
  return out as Settings;
}

export async function saveSettings(patch: Partial<Settings>) {
  await batch(
    Object.entries(patch)
      .filter(([k, v]) => k in DEFAULT_SETTINGS && v !== undefined)
      .map(([k, v]) => ({
        sql: "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value",
        args: [k, JSON.stringify(v)],
      })),
  );
  return getSettings();
}
