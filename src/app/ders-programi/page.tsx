"use client";

import { CalendarRange, GraduationCap, MapPin, Pencil, Plus, Trash2, Wand2 } from "lucide-react";
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { emitChanged, toast } from "@/components/toast";
import { api, useApi } from "@/lib/client";
import type { Course } from "@/lib/courses";

type ExamWeek = { name: string; start: string; end: string; skipClasses: boolean };
type SemesterSettings = { semesterStart: string | null; semesterEnd: string | null; examWeeks: ExamWeek[] };

const DAYS = [
  { d: 1, label: "Pazartesi", short: "Pzt" },
  { d: 2, label: "Salı", short: "Sal" },
  { d: 3, label: "Çarşamba", short: "Çar" },
  { d: 4, label: "Perşembe", short: "Per" },
  { d: 5, label: "Cuma", short: "Cum" },
  { d: 6, label: "Cumartesi", short: "Cmt" },
  { d: 0, label: "Pazar", short: "Paz" },
];
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export default function CoursesPage() {
  const courses = useApi<Course[]>("/api/courses");
  const settings = useApi<SemesterSettings>("/api/settings");
  const [sem, setSem] = useState<SemesterSettings>({ semesterStart: null, semesterEnd: null, examWeeks: [] });
  const [editing, setEditing] = useState<Partial<Course> | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (settings.data)
      setSem({ semesterStart: settings.data.semesterStart, semesterEnd: settings.data.semesterEnd, examWeeks: settings.data.examWeeks ?? [] });
  }, [settings.data]);

  const list = courses.data ?? [];
  // Haftalık tabloda yalnızca dersi olan günler + hafta içi
  const shownDays = DAYS.filter((x) => x.d >= 1 && x.d <= 5 || list.some((c) => c.weekday === x.d));
  const minStart = Math.min(...list.map((c) => toMin(c.start_time)), 9 * 60);
  const maxEnd = Math.max(...list.map((c) => toMin(c.end_time)), 17 * 60);
  const hours = Array.from({ length: Math.ceil((maxEnd - Math.floor(minStart / 60) * 60) / 60) }, (_, i) => Math.floor(minStart / 60) + i);
  const PX = 0.9; // dakika başına piksel
  const top0 = Math.floor(minStart / 60) * 60;

  const saveSemester = async () => {
    await api("/api/settings", { method: "PUT", body: sem });
    toast("Dönem bilgisi kaydedildi", "success");
  };

  const generate = async () => {
    setBusy(true);
    try {
      await api("/api/settings", { method: "PUT", body: sem });
      const r = await api<{ classes: number; exams: number }>("/api/courses/generate", { method: "POST" });
      toast(`${r.classes} ders saati${r.exams ? ` ve ${r.exams} sınav haftası` : ""} takvime işlendi`, "success");
      emitChanged();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const setExam = (i: number, patch: Partial<ExamWeek>) =>
    setSem((s) => ({ ...s, examWeeks: s.examWeeks.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
            <GraduationCap className="text-brand-600" /> Ders programı
          </h1>
          <p className="muted text-sm">Sadece planlayıcıda durur. Akıllı planlama ders saatlerini dolu sayar.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => setEditing({ weekday: 1, start_time: "09:25", end_time: "11:05" })}>
            <Plus size={16} /> Ders ekle
          </button>
          <button className="btn-primary" onClick={generate} disabled={busy || !list.length}>
            <Wand2 size={16} /> {busy ? "İşleniyor…" : "Programı takvime işle"}
          </button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card space-y-4 lg:col-span-1">
          <h2 className="flex items-center gap-2 font-semibold">
            <CalendarRange size={18} className="text-brand-600" /> Dönem
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="label">Başlangıç</span>
              <input type="date" className="input" value={sem.semesterStart ?? ""} onChange={(e) => setSem({ ...sem, semesterStart: e.target.value || null })} />
            </label>
            <label>
              <span className="label">Bitiş</span>
              <input type="date" className="input" value={sem.semesterEnd ?? ""} onChange={(e) => setSem({ ...sem, semesterEnd: e.target.value || null })} />
            </label>
          </div>
          <div>
            <p className="label">Sınav haftaları</p>
            <ul className="space-y-2">
              {sem.examWeeks.map((x, i) => (
                <li key={i} className="surface-2 space-y-2 rounded-xl p-3">
                  <div className="flex gap-2">
                    <input className="input" value={x.name} placeholder="Ad (ör. Vize haftası)" onChange={(e) => setExam(i, { name: e.target.value })} aria-label="Sınav haftası adı" />
                    <button className="btn-danger h-10 w-10 shrink-0 p-0" onClick={() => setSem({ ...sem, examWeeks: sem.examWeeks.filter((_, j) => j !== i) })} aria-label={`${x.name || "Sınav haftası"} sil`}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="date" className="input" value={x.start} onChange={(e) => setExam(i, { start: e.target.value })} aria-label="Başlangıç" />
                    <input type="date" className="input" value={x.end} onChange={(e) => setExam(i, { end: e.target.value })} aria-label="Bitiş" />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={x.skipClasses} onChange={(e) => setExam(i, { skipClasses: e.target.checked })} />
                    Bu hafta dersler yapılmaz
                  </label>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap gap-2">
              <button className="btn-ghost" onClick={() => setSem({ ...sem, examWeeks: [...sem.examWeeks, { name: "Vize haftası", start: "", end: "", skipClasses: true }] })}>
                <Plus size={16} /> Vize
              </button>
              <button className="btn-ghost" onClick={() => setSem({ ...sem, examWeeks: [...sem.examWeeks, { name: "Final haftası", start: "", end: "", skipClasses: true }] })}>
                <Plus size={16} /> Final
              </button>
            </div>
          </div>
          <button className="btn-ghost w-full" onClick={saveSemester}>
            Dönemi kaydet
          </button>
          <p className="muted text-xs">Değişiklikten sonra "Programı takvime işle"ye bas; eski ders etkinlikleri silinip baştan oluşturulur.</p>
        </section>

        <section className="card overflow-x-auto lg:col-span-2">
          <h2 className="mb-3 font-semibold">Haftalık görünüm</h2>
          {list.length === 0 ? (
            <div className="py-12 text-center">
              <GraduationCap className="muted mx-auto mb-2" />
              <p className="muted text-sm">Henüz ders yok. "Ders ekle" ile başla.</p>
            </div>
          ) : (
            <div className="grid min-w-[560px] gap-1" style={{ gridTemplateColumns: `44px repeat(${shownDays.length}, 1fr)` }}>
              <div />
              {shownDays.map((x) => (
                <div key={x.d} className="pb-1 text-center text-xs font-semibold">
                  {x.short}
                </div>
              ))}
              <div className="relative" style={{ height: (maxEnd - top0) * PX }}>
                {hours.map((h) => (
                  <span key={h} className="muted absolute right-1 text-[10px] tabular-nums" style={{ top: (h * 60 - top0) * PX - 6 }}>
                    {String(h).padStart(2, "0")}:00
                  </span>
                ))}
              </div>
              {shownDays.map((x) => (
                <div key={x.d} className="surface-2 relative rounded-xl" style={{ height: (maxEnd - top0) * PX }}>
                  {list
                    .filter((c) => c.weekday === x.d)
                    .map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setEditing(c)}
                        className="absolute inset-x-1 overflow-hidden rounded-lg border-l-4 border-brand-600 bg-brand-50 px-1.5 py-1 text-left transition hover:bg-brand-100 dark:bg-brand-500/15 dark:hover:bg-brand-500/25"
                        style={{ top: (toMin(c.start_time) - top0) * PX, height: (toMin(c.end_time) - toMin(c.start_time)) * PX - 2 }}
                        title={`${c.name} · ${c.start_time}–${c.end_time}${c.room ? ` · ${c.room}` : ""}`}
                      >
                        <p className="text-[11px] font-semibold leading-tight">{c.name}</p>
                        <p className="muted text-[10px] tabular-nums">
                          {c.start_time}–{c.end_time}
                          {c.room && ` · ${c.room}`}
                        </p>
                      </button>
                    ))}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {list.length > 0 && (
        <section className="card">
          <h2 className="mb-2 font-semibold">Dersler ({list.length})</h2>
          <ul className="divide-y divide-[var(--border)]">
            {list.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="w-24 shrink-0 text-sm font-semibold">{DAYS.find((x) => x.d === c.weekday)?.label}</span>
                <span className="w-28 shrink-0 text-sm tabular-nums">
                  {c.start_time}–{c.end_time}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{c.name}</span>
                  <span className="muted block text-xs">
                    {[c.code, c.instructor].filter(Boolean).join(" · ")}
                    {c.room && (
                      <>
                        {" "}
                        · <MapPin size={11} className="inline" /> {c.room}
                      </>
                    )}
                  </span>
                </span>
                <button className="btn-ghost h-10 w-10 border-0 p-0" onClick={() => setEditing(c)} aria-label={`${c.name} düzenle`}>
                  <Pencil size={16} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <CourseEditor course={editing} onClose={() => setEditing(null)} onSaved={(l) => courses.setData(l)} />
    </div>
  );
}

function CourseEditor({ course, onClose, onSaved }: { course: Partial<Course> | null; onClose: () => void; onSaved: (list: Course[]) => void }) {
  const [f, setF] = useState<Partial<Course>>({});
  useEffect(() => {
    if (course) setF(course);
  }, [course]);
  if (!course) return null;
  const set = (p: Partial<Course>) => setF((x) => ({ ...x, ...p }));
  const isNew = !course.id;

  const save = async () => {
    try {
      const list = isNew
        ? await api<Course[]>("/api/courses", { body: f })
        : await api<Course[]>(`/api/courses/${course.id}`, { method: "PATCH", body: f });
      onSaved(list);
      toast(isNew ? "Ders eklendi — takvime yansıması için \"Programı takvime işle\"" : "Ders güncellendi", "success");
      onClose();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  const remove = async () => {
    if (!confirm(`"${course.name}" dersi ve takvimdeki saatleri silinsin mi?`)) return;
    onSaved(await api<Course[]>(`/api/courses/${course.id}`, { method: "DELETE" }));
    emitChanged();
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={isNew ? "Ders ekle" : "Dersi düzenle"}>
      <div className="space-y-3">
        <label className="block">
          <span className="label">Ders adı</span>
          <input autoFocus className="input" value={f.name ?? ""} onChange={(e) => set({ name: e.target.value })} placeholder="ör. Yapay Sinir Ağları" />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label>
            <span className="label">Gün</span>
            <select className="input" value={f.weekday ?? 1} onChange={(e) => set({ weekday: Number(e.target.value) })}>
              {DAYS.map((x) => (
                <option key={x.d} value={x.d}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Başlangıç</span>
            <input type="time" className="input" value={f.start_time ?? ""} onChange={(e) => set({ start_time: e.target.value })} />
          </label>
          <label>
            <span className="label">Bitiş</span>
            <input type="time" className="input" value={f.end_time ?? ""} onChange={(e) => set({ end_time: e.target.value })} />
          </label>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <label>
            <span className="label">Derslik</span>
            <input className="input" value={f.room ?? ""} onChange={(e) => set({ room: e.target.value })} placeholder="G010" />
          </label>
          <label>
            <span className="label">Ders kodu</span>
            <input className="input" value={f.code ?? ""} onChange={(e) => set({ code: e.target.value })} placeholder="1230501" />
          </label>
          <label>
            <span className="label">Hoca</span>
            <input className="input" value={f.instructor ?? ""} onChange={(e) => set({ instructor: e.target.value })} />
          </label>
        </div>
        <div className="flex justify-between gap-2 pt-1">
          {!isNew ? (
            <button className="btn-danger" onClick={remove}>
              <Trash2 size={16} /> Sil
            </button>
          ) : (
            <span />
          )}
          <button className="btn-primary" onClick={save}>
            {isNew ? "Ekle" : "Kaydet"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
