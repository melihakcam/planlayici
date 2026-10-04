import { addDays, all, batch, get, nowIso, parseYmd, uid, ymd, type Args } from "./db";
import { getSettings } from "./settings";

/** Ders programının yazıldığı yerel takvim (Google'a gönderilmez) */
export const SCHOOL_CALENDAR = "local:okul";

export type Course = {
  id: string;
  name: string;
  code: string;
  instructor: string;
  room: string;
  /** 0 = Pazar … 6 = Cumartesi */
  weekday: number;
  start_time: string; // "09:25"
  end_time: string; // "11:05"
  created_at: string;
};

export type CourseInput = Partial<Omit<Course, "id" | "created_at">>;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function clean(input: CourseInput, cur?: Course) {
  const weekday = Number(input.weekday ?? cur?.weekday);
  const start = input.start_time ?? cur?.start_time ?? "";
  const end = input.end_time ?? cur?.end_time ?? "";
  if (!(weekday >= 0 && weekday <= 6)) throw new Error("Geçersiz gün");
  if (!TIME.test(start) || !TIME.test(end) || end <= start) throw new Error("Başlangıç ve bitiş saati geçersiz (bitiş başlangıçtan sonra olmalı)");
  return {
    name: (input.name ?? cur?.name ?? "").trim() || "Ders",
    code: (input.code ?? cur?.code ?? "").trim(),
    instructor: (input.instructor ?? cur?.instructor ?? "").trim(),
    room: (input.room ?? cur?.room ?? "").trim(),
    weekday,
    start_time: start,
    end_time: end,
  };
}

export function listCourses() {
  return all<Course>("SELECT * FROM courses ORDER BY weekday, start_time");
}

export async function createCourse(input: CourseInput) {
  const id = uid();
  await batch([
    {
      sql: `INSERT INTO courses (id, name, code, instructor, room, weekday, start_time, end_time, created_at)
            VALUES (@id, @name, @code, @instructor, @room, @weekday, @start_time, @end_time, @created_at)`,
      args: { id, ...clean(input), created_at: nowIso() },
    },
  ]);
  return id;
}

export async function updateCourse(id: string, input: CourseInput) {
  const cur = await get<Course>("SELECT * FROM courses WHERE id = ?", [id]);
  if (!cur) throw new Error("Ders bulunamadı");
  await batch([
    {
      sql: `UPDATE courses SET name=@name, code=@code, instructor=@instructor, room=@room, weekday=@weekday,
              start_time=@start_time, end_time=@end_time WHERE id=@id`,
      args: { id, ...clean(input, cur) },
    },
  ]);
}

export async function deleteCourse(id: string) {
  await batch([
    { sql: "DELETE FROM events WHERE series_id = ?", args: [`course:${id}`] },
    { sql: "DELETE FROM courses WHERE id = ?", args: [id] },
  ]);
}

/**
 * Dersleri dönem boyunca okul takvimine işler. Önceki ders ve sınav haftası
 * etkinlikleri silinip baştan oluşturulur; "dersler yapılmaz" işaretli sınav
 * haftalarında ders konmaz, o hafta tüm gün etkinliği olarak görünür.
 */
export async function generateSchedule() {
  const s = await getSettings();
  if (!s.semesterStart || !s.semesterEnd) throw new Error("Önce dönem başlangıç ve bitiş tarihlerini gir");
  if (s.semesterEnd < s.semesterStart) throw new Error("Dönem bitişi başlangıçtan önce olamaz");
  const courses = await listCourses();
  const exams = (s.examWeeks ?? []).filter((x) => x.start && x.end && x.end >= x.start);
  const inExam = (k: string) => exams.some((x) => x.skipClasses && k >= x.start && k <= x.end);

  const ts = nowIso();
  const stmts: { sql: string; args?: Args }[] = [
    // Önceki program (eski elle eklenmiş "🎓" dersler dahil) temizlenir
    {
      sql: `DELETE FROM events WHERE calendar_id = ? AND (series_id LIKE 'course:%' OR series_id LIKE 'exam:%' OR title LIKE '🎓 %')`,
      args: [SCHOOL_CALENDAR],
    },
  ];
  const insert = (row: Record<string, unknown>) =>
    stmts.push({
      sql: `INSERT INTO events (id, calendar_id, title, description, location, start, "end", start_ms, end_ms, all_day,
              series_id, reminder_min, dirty, deleted, created_at, updated_at)
            VALUES (@id, @calendar_id, @title, @description, @location, @start, @end, @start_ms, @end_ms, @all_day,
              @series_id, @reminder_min, 0, 0, @ts, @ts)`,
      args: { ...row, calendar_id: SCHOOL_CALENDAR, ts },
    });

  let classes = 0;
  const first = parseYmd(s.semesterStart);
  const last = parseYmd(s.semesterEnd);
  for (let d = new Date(first); d <= last; d = addDays(d, 1)) {
    const k = ymd(d);
    if (inExam(k)) continue;
    for (const c of courses.filter((c) => c.weekday === d.getDay())) {
      const [sh, sm] = c.start_time.split(":").map(Number);
      const [eh, em] = c.end_time.split(":").map(Number);
      const start = new Date(d);
      start.setHours(sh, sm, 0, 0);
      const end = new Date(d);
      end.setHours(eh, em, 0, 0);
      insert({
        id: uid(),
        title: c.name,
        description: [c.code, c.instructor].filter(Boolean).join(" · "),
        location: c.room,
        start: start.toISOString(),
        end: end.toISOString(),
        start_ms: start.getTime(),
        end_ms: end.getTime(),
        all_day: 0,
        series_id: `course:${c.id}`,
        reminder_min: 15,
      });
      classes++;
    }
  }
  for (const x of exams) {
    const endEx = ymd(addDays(parseYmd(x.end), 1));
    insert({
      id: uid(),
      title: x.name || "Sınav haftası",
      description: x.skipClasses ? "Bu hafta dersler yapılmaz." : "",
      location: "",
      start: x.start,
      end: endEx,
      start_ms: parseYmd(x.start).getTime(),
      end_ms: parseYmd(endEx).getTime(),
      all_day: 1,
      series_id: `exam:${x.name}`,
      reminder_min: null,
    });
  }
  await batch(stmts);
  return { classes, exams: exams.length };
}
