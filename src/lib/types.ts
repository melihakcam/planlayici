// İstemci ve sunucu arasında paylaşılan tipler.

export type EventRow = {
  id: string;
  calendar_id: string;
  title: string;
  description: string;
  location: string;
  start: string; // tüm gün: YYYY-MM-DD, değilse ISO (UTC)
  end: string; // tüm gün için hariç tutulan bitiş günü
  start_ms: number;
  end_ms: number;
  all_day: number;
  color_id: string | null;
  reminder_min: number | null;
  google_id: string | null;
  recurring_event_id: string | null;
  recurrence: string | null;
  series_id: string | null;
  task_id: string | null;
  dirty: number;
  deleted: number;
  created_at: string;
  updated_at: string;
  /** listEvents ile gelen takvim bilgileri */
  calendar_color?: string | null;
  calendar_name?: string | null;
  writable?: number;
};

export type CalendarRow = {
  id: string;
  summary: string;
  color: string;
  access_role: string;
  is_primary: number;
  selected: number;
};

export type Task = {
  id: string;
  title: string;
  notes: string;
  priority: number; // 1 (acil) - 4 (düşük)
  due: string | null; // YYYY-MM-DD
  duration_min: number;
  status: "todo" | "done";
  repeat: "daily" | "weekly" | "monthly" | null;
  project_id: string | null;
  parent_id: string | null;
  event_id: string | null;
  created_at: string;
  completed_at: string | null;
  /** Kullanıcının "bu gün yapacağım" dediği tarih (sabah planı) */
  planned_date: string | null;
  /** "Günün en önemli 3 işi" olarak işaretlendiği tarih */
  top_date: string | null;
  /** Doluysa iş bu uzunlukta parçalara bölünüp günlere dağıtılır (dk) */
  chunk_min: number | null;
  /** Tercih edilen zaman dilimi */
  time_pref: TimePref | null;
  /** Takvimde bu göreve ayrılmış toplam süre (dk) */
  scheduled_min?: number;
  event_start?: string | null;
  event_end?: string | null;
  event_all_day?: number | null;
};

export type TimePref = "sabah" | "ogle" | "aksam";
/** Zaman dilimleri: [başlangıç saati, bitiş saati) */
export const TIME_PREFS: Record<TimePref, { label: string; from: number; to: number }> = {
  sabah: { label: "Sabah (12:00'ye kadar)", from: 0, to: 12 },
  ogle: { label: "Öğleden sonra (12–18)", from: 12, to: 18 },
  aksam: { label: "Akşam (18:00'den sonra)", from: 18, to: 24 },
};

export type Area = "yazilim" | "is" | "okul" | "kisisel";
export const AREAS: Record<Area, { label: string }> = {
  yazilim: { label: "Yazılım" },
  is: { label: "İş" },
  okul: { label: "Okul" },
  kisisel: { label: "Kişisel" },
};

export type Project = {
  id: string;
  name: string;
  color: string;
  created_at: string;
  area: Area;
  /** fikir = henüz başlanmamış proje fikri, red = vazgeçilen proje/fikir (ikisi de planlamaya girmez) */
  status: "active" | "paused" | "done" | "red" | "fikir";
  deadline: string | null;
  weekly_hours: number;
  notes: string;
};

/** Proje + bu haftaki ilerleme bilgisi */
export type ProjectStats = Project & {
  open_tasks: number;
  done_tasks: number;
  next_due: string | null;
  /** Bu hafta harcanan (geçmiş zaman blokları + odak oturumları), saat */
  week_done_h: number;
  /** Bu hafta ileride planlanmış, saat */
  week_planned_h: number;
};

/** Sabah planı için öneri */
export type Suggestion = { task: Task; score: number; reasons: string[] };

export type Habit = {
  id: string;
  name: string;
  icon: string;
  color: string;
  days: string;
  target: number;
  archived: number;
  /** Gün içinde kaç dakikada bir hatırlatılsın (boş = hatırlatma yok) */
  remind_every: number | null;
  remind_start: string;
  remind_end: string;
  created_at: string;
  logs: Record<string, number>;
  streak: number;
};

/** Google Calendar etkinlik renkleri (colorId → renk) */
export const GOOGLE_COLORS: Record<string, { name: string; hex: string }> = {
  "1": { name: "Lavanta", hex: "#7986cb" },
  "2": { name: "Adaçayı", hex: "#33b679" },
  "3": { name: "Üzüm", hex: "#8e24aa" },
  "4": { name: "Flamingo", hex: "#e67c73" },
  "5": { name: "Muz", hex: "#f6bf26" },
  "6": { name: "Mandalina", hex: "#f4511e" },
  "7": { name: "Tavuskuşu", hex: "#039be5" },
  "8": { name: "Grafit", hex: "#616161" },
  "9": { name: "Yaban mersini", hex: "#3f51b5" },
  "10": { name: "Fesleğen", hex: "#0b8043" },
  "11": { name: "Domates", hex: "#d50000" },
};
export const DEFAULT_EVENT_COLOR = "#4f46e5";

/** Etkinlik rengi: önce etkinliğin kendi rengi, yoksa takvimin rengi. */
export function eventColor(e: Pick<EventRow, "color_id" | "calendar_color">) {
  if (e.color_id && GOOGLE_COLORS[e.color_id]) return GOOGLE_COLORS[e.color_id].hex;
  return e.calendar_color || DEFAULT_EVENT_COLOR;
}

export const PRIORITY_COLOR: Record<number, string> = { 1: "#dc2626", 2: "#ea580c", 3: "#2563eb", 4: "#9ca3af" };
export const PRIORITY_LABEL: Record<number, string> = { 1: "Acil", 2: "Yüksek", 3: "Orta", 4: "Düşük" };
/** Otomatik planlanan görev etkinliklerinin Google renkleri */
export const PRIORITY_GOOGLE_COLOR: Record<number, string> = { 1: "11", 2: "6", 3: "7", 4: "8" };
