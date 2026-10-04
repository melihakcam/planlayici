"use client";

import { AlertTriangle, ArrowRight, CalendarClock, CalendarPlus, Check, Clock, MapPin, RefreshCw, Star, Sun } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import EventModal, { type EventDraft } from "@/components/EventModal";
import QuickAdd from "@/components/QuickAdd";
import TaskItem from "@/components/TaskItem";
import { onChanged, toast } from "@/components/toast";
import { addDays, api, fmtMinutes, fmtTime, relDay, useApi, ymd } from "@/lib/client";
import { AREAS, eventColor, type EventRow, type Habit, type ProjectStats, type Task } from "@/lib/types";

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return "İyi geceler";
  if (h < 12) return "Günaydın";
  if (h < 18) return "İyi günler";
  return "İyi akşamlar";
}

export default function TodayPage() {
  const today = ymd(new Date());
  const dayStart = new Date(`${today}T00:00:00`);
  const range = `start=${dayStart.toISOString()}&end=${addDays(dayStart, 1).toISOString()}`;
  const events = useApi<EventRow[]>(`/api/events?${range}`);
  const tasks = useApi<Task[]>("/api/tasks");
  const projects = useApi<ProjectStats[]>("/api/projects");
  const status = useApi<{ plannedAt: string | null; missed: number }>("/api/plan?status=1");
  const habits = useApi<Habit[]>("/api/habits");
  const focus = useApi<{ minutes: number }[]>("/api/focus?days=1");
  const free = useApi<{ start: number; end: number }[]>("/api/schedule");
  const [modal, setModal] = useState<{ event?: EventRow | null; draft?: EventDraft | null } | null>(null);
  const [planning, setPlanning] = useState(false);
  const [now, setNow] = useState(Date.now());

  const reloadAll = () => {
    events.reload();
    tasks.reload();
    habits.reload();
    free.reload();
    status.reload();
    projects.reload();
  };
  useEffect(() => onChanged(reloadAll));
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const todayTasks = useMemo(
    () =>
      (tasks.data ?? []).filter(
        (t) =>
          !t.parent_id &&
          ((t.status === "todo" &&
            ((t.due && t.due <= today) ||
              t.planned_date === today ||
              t.top_date === today ||
              (t.event_start && ymd(new Date(t.event_start)) === today))) ||
            (t.status === "done" && t.completed_at && ymd(new Date(t.completed_at)) === today)),
      ),
    [tasks.data, today],
  );
  const doneToday = todayTasks.filter((t) => t.status === "done").length;
  const focusMin = (focus.data ?? []).reduce((a, f) => a + f.minutes, 0);
  const freeMin = Math.round((free.data ?? []).reduce((a, s) => a + (s.end - s.start), 0) / 60_000);
  const allDay = (events.data ?? []).filter((e) => e.all_day);
  const timed = (events.data ?? []).filter((e) => !e.all_day);
  const todaysHabits = (habits.data ?? []).filter((h) => h.days.includes(String(new Date().getDay())));

  const toggleTask = async (t: Task) => {
    await api(`/api/tasks/${t.id}`, { method: "PATCH", body: { status: t.status === "done" ? "todo" : "done" } });
    tasks.reload();
  };

  /** Yapılmadan geçen blokları sonraki boş saatlere kaydır */
  const catchUp = async () => {
    setPlanning(true);
    try {
      const r = await api<{ moved: number; planned: unknown[]; unplanned: unknown[] }>("/api/schedule", {
        body: { catchUp: true },
      });
      toast(
        r.moved
          ? `${r.planned.length} iş sonraki boş saatlere kaydırıldı${r.unplanned.length ? `, ${r.unplanned.length} iş sığmadı` : ""}`
          : "Kaydırılacak blok yok",
        "success",
      );
      reloadAll();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setPlanning(false);
    }
  };

  const logHabit = async (h: Habit) => {
    const cur = h.logs[today] ?? 0;
    await api(`/api/habits/${h.id}`, { body: { date: today, count: cur >= h.target ? 0 : cur + 1 } });
    habits.reload();
  };

  const newEvent = () => {
    const s = new Date(Math.ceil(Date.now() / 1_800_000) * 1_800_000);
    setModal({ draft: { start: s, end: new Date(s.getTime() + 3_600_000), allDay: false } });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="muted text-sm">{new Date().toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{greeting()} 👋</h1>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={newEvent}>
            <CalendarPlus size={16} /> Etkinlik
          </button>
          <Link href="/planla" className="btn-primary">
            <Sun size={16} /> Günü planla
          </Link>
        </div>
      </header>

      {/* Sabah planı hatırlatması */}
      {status.data && !status.data.plannedAt && new Date().getHours() < 20 && (
        <Link
          href="/planla"
          className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 p-4 text-white shadow-sm transition hover:opacity-95"
        >
          <Sun size={28} className="shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">Bugünü henüz planlamadın</p>
            <p className="text-sm opacity-90">5 dakikada dünden kalanları toparla, en önemli 3 işini seç, saatlere yerleştir.</p>
          </div>
          <ArrowRight className="shrink-0" />
        </Link>
      )}

      {/* Kaçırılan bloklar */}
      {(status.data?.missed ?? 0) > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/40 dark:bg-amber-500/10">
          <AlertTriangle className="shrink-0 text-amber-600" />
          <p className="flex-1 text-sm">
            <b>{status.data!.missed} iş</b> planlandığı saatte yapılmadı. Sonraki boş saatlere kaydırayım mı?
          </p>
          <button className="btn-primary" onClick={catchUp} disabled={planning}>
            <RefreshCw size={16} className={planning ? "animate-spin" : ""} /> Planı kaydır
          </button>
        </div>
      )}

      <NowCard events={events.data ?? []} tasks={tasks.data ?? []} now={now} today={today} onToggle={toggleTask} onOpen={(e) => setModal({ event: e })} />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Bugünkü etkinlik" value={String(events.data?.length ?? "–")} />
        <Stat label="Tamamlanan görev" value={`${doneToday}/${todayTasks.length}`} />
        <Stat label="Odak süresi" value={fmtMinutes(focusMin)} />
        <Stat label="Kalan boş zaman" value={fmtMinutes(freeMin)} />
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="card lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Bugünün programı</h2>
            <Link href="/takvim" className="text-sm text-brand-600 hover:underline">
              Takvimi aç
            </Link>
          </div>
          {allDay.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {allDay.map((e) => (
                <button
                  key={e.id}
                  onClick={() => setModal({ event: e })}
                  className="chip px-3 py-1 text-white"
                  style={{ background: eventColor(e) }}
                >
                  {e.title}
                </button>
              ))}
            </div>
          )}
          {timed.length === 0 && allDay.length === 0 && <p className="muted py-8 text-center text-sm">Bugün için etkinlik yok.</p>}
          <ol className="space-y-1">
            {timed.map((e) => {
              const past = e.end_ms < now;
              const live = e.start_ms <= now && e.end_ms > now;
              const color = eventColor(e);
              return (
                <li key={e.id}>
                  <button
                    onClick={() => setModal({ event: e })}
                    className={`flex w-full items-stretch gap-3 rounded-xl p-2 text-left transition hover:bg-black/[0.03] dark:hover:bg-white/[0.04] ${past ? "opacity-50" : ""}`}
                  >
                    <div className="w-14 shrink-0 text-right text-xs">
                      <div className="font-semibold">{fmtTime(e.start)}</div>
                      <div className="muted">{fmtTime(e.end)}</div>
                    </div>
                    <div className="w-1 shrink-0 rounded-full" style={{ background: color }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {e.title}
                        {live && <span className="chip ml-2 bg-red-500 text-white">Şimdi</span>}
                        {e.task_id && <span className="chip ml-2 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-100">Görev</span>}
                      </p>
                      {e.location && (
                        <p className="muted truncate text-xs">
                          <MapPin size={11} className="mr-1 inline" />
                          {e.location}
                        </p>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>

        <div className="space-y-6 lg:col-span-2">
          <section className="card">
            <h2 className="mb-3 font-semibold">Bugünkü görevler</h2>
            <QuickAdd projects={projects.data ?? []} defaults={{ due: today }} onAdded={tasks.reload} placeholder="Bugün için görev ekle…" />
            <div className="mt-3 space-y-0.5">
              {todayTasks.length === 0 && <p className="muted py-4 text-center text-sm">Bugün için görev yok 🎉</p>}
              {todayTasks.map((t) => (
                <TaskItem key={t.id} task={t} project={projects.data?.find((p) => p.id === t.project_id)} onToggle={() => toggleTask(t)} />
              ))}
            </div>
            <Link href="/gorevler" className="mt-2 block text-sm text-brand-600 hover:underline">
              Tüm görevler →
            </Link>
          </section>

          <section className="card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Alışkanlıklar</h2>
              <Link href="/aliskanliklar" className="text-sm text-brand-600 hover:underline">
                Yönet
              </Link>
            </div>
            {todaysHabits.length === 0 && <p className="muted py-2 text-sm">Bugün için alışkanlık yok.</p>}
            <div className="space-y-2">
              {todaysHabits.map((h) => {
                const c = h.logs[today] ?? 0;
                const ok = c >= h.target;
                return (
                  <button
                    key={h.id}
                    onClick={() => logHabit(h)}
                    className="flex w-full items-center gap-3 rounded-xl border border-theme p-2 text-left transition hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                  >
                    <span className="text-xl">{h.icon}</span>
                    <span className="flex-1 text-sm font-medium">{h.name}</span>
                    {h.target > 1 && (
                      <span className="muted text-xs">
                        {c}/{h.target}
                      </span>
                    )}
                    {h.streak > 0 && <span className="text-xs">🔥 {h.streak}</span>}
                    <span
                      className="grid h-7 w-7 place-items-center rounded-full border-2"
                      style={{ borderColor: h.color, background: ok ? h.color : undefined }}
                    >
                      {ok && <Check size={14} className="text-white" strokeWidth={3} />}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <Upcoming projects={projects.data ?? []} tasks={tasks.data ?? []} today={today} />

          <Link href="/odak" className="card flex items-center gap-3 transition hover:border-brand-500">
            <Clock className="text-brand-600" />
            <div>
              <p className="text-sm font-semibold">Odak zamanı başlat</p>
              <p className="muted text-xs">Pomodoro ile derin çalışma</p>
            </div>
          </Link>
        </div>
      </div>

      <EventModal
        open={!!modal}
        onClose={() => setModal(null)}
        event={modal?.event}
        draft={modal?.draft}
        onSaved={reloadAll}
      />
    </div>
  );
}

/** Şu an ne yapılmalı + günün en önemli 3 işi */
function NowCard({
  events,
  tasks,
  now,
  today,
  onToggle,
  onOpen,
}: {
  events: EventRow[];
  tasks: Task[];
  now: number;
  today: string;
  onToggle: (t: Task) => void;
  onOpen: (e: EventRow) => void;
}) {
  const timed = events.filter((e) => !e.all_day).sort((a, b) => a.start_ms - b.start_ms);
  const current = timed.find((e) => e.start_ms <= now && e.end_ms > now);
  const next = timed.find((e) => e.start_ms > now);
  const top = tasks.filter((t) => t.top_date === today && !t.parent_id);
  const currentTask = current?.task_id ? tasks.find((t) => t.id === current.task_id) : undefined;
  const mins = (ms: number) => Math.max(0, Math.round(ms / 60_000));

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <div className="card flex flex-col justify-between gap-3 border-brand-500/40">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Şimdi</p>
        {current ? (
          <div>
            <button className="text-left text-xl font-bold hover:underline" onClick={() => onOpen(current)}>
              {current.title}
            </button>
            <p className="muted text-sm">
              {fmtTime(current.start)}–{fmtTime(current.end)} · bitişe {fmtMinutes(mins(current.end_ms - now))}
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${((now - current.start_ms) / (current.end_ms - current.start_ms)) * 100}%`,
                  background: eventColor(current),
                }}
              />
            </div>
            {currentTask && currentTask.status === "todo" && (
              <button className="btn-primary mt-3" onClick={() => onToggle(currentTask)}>
                <Check size={16} /> Tamamladım
              </button>
            )}
          </div>
        ) : (
          <div>
            <p className="text-xl font-bold">Şu an boş zamandasın</p>
            <p className="muted text-sm">
              {top.find((t) => t.status === "todo")
                ? `Önerim: "${top.find((t) => t.status === "todo")!.title}" ile başla.`
                : "Sabah planında en önemli işlerini seçersen burada önereceğim."}
            </p>
          </div>
        )}
        {next && (
          <p className="text-sm">
            <span className="muted">Sıradaki:</span> <b>{next.title}</b>{" "}
            <span className="muted">
              {fmtTime(next.start)} ({fmtMinutes(mins(next.start_ms - now))} sonra)
            </span>
          </p>
        )}
      </div>

      <div className="card">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-600">
          <Star size={14} fill="currentColor" /> Günün en önemli 3 işi
        </p>
        {top.length === 0 ? (
          <p className="muted text-sm">
            Henüz seçilmedi.{" "}
            <Link href="/planla" className="text-brand-600 hover:underline">
              Sabah planında seç →
            </Link>
          </p>
        ) : (
          <div className="space-y-0.5">
            {top.map((t) => (
              <TaskItem key={t.id} task={t} onToggle={() => onToggle(t)} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/** Yaklaşan proje teslimleri ve son tarihli işler */
function Upcoming({ projects, tasks, today }: { projects: ProjectStats[]; tasks: Task[]; today: string }) {
  const in14 = ymd(addDays(new Date(), 14));
  const in7 = ymd(addDays(new Date(), 7));
  const items = [
    ...projects
      .filter((p) => p.status === "active" && p.deadline && p.deadline >= today && p.deadline <= in14)
      .map((p) => ({ key: `p${p.id}`, date: p.deadline!, title: `${AREAS[p.area]?.icon ?? ""} ${p.name}`, kind: "Proje teslimi" })),
    ...tasks
      .filter((t) => t.status === "todo" && !t.parent_id && t.due && t.due > today && t.due <= in7)
      .map((t) => ({ key: `t${t.id}`, date: t.due!, title: t.title, kind: "Son tarih" })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  if (!items.length) return null;
  return (
    <section className="card">
      <h2 className="mb-3 flex items-center gap-2 font-semibold">
        <CalendarClock size={18} className="text-brand-600" /> Yaklaşan teslimler
      </h2>
      <ul className="space-y-2">
        {items.slice(0, 8).map((i) => (
          <li key={i.key} className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">
              {i.title}
              <span className="muted ml-1 text-xs">· {i.kind}</span>
            </span>
            <span className="shrink-0 text-xs font-medium">{relDay(i.date)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <p className="muted text-xs">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
    </div>
  );
}
