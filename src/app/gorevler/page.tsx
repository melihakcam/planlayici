"use client";

import { CalendarX, Inbox, ListTodo, Plus, Sparkles, Sun, Trash2, CalendarRange, CheckCircle2, CircleDashed } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/Modal";
import QuickAdd from "@/components/QuickAdd";
import TaskItem from "@/components/TaskItem";
import { onChanged, toast } from "@/components/toast";
import { addDays, api, relDay, useApi, ymd } from "@/lib/client";
import { PRIORITY_COLOR, PRIORITY_LABEL, TIME_PREFS, type Project, type Task } from "@/lib/types";

type Filter = "all" | "today" | "upcoming" | "nodate" | "done" | `p:${string}`;

const FILTERS: { id: Filter; label: string; icon: typeof Inbox }[] = [
  { id: "all", label: "Tümü", icon: Inbox },
  { id: "today", label: "Bugün", icon: Sun },
  { id: "upcoming", label: "Yaklaşan 7 gün", icon: CalendarRange },
  { id: "nodate", label: "Tarihsiz", icon: CircleDashed },
  { id: "done", label: "Tamamlanan", icon: CheckCircle2 },
];

const PROJECT_COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#06b6d4", "#ef4444", "#8b5cf6", "#64748b"];

export default function TasksPage() {
  const tasks = useApi<Task[]>("/api/tasks");
  const projects = useApi<Project[]>("/api/projects");
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<Task | null>(null);
  const [planning, setPlanning] = useState(false);
  const [newProject, setNewProject] = useState("");

  useEffect(() => onChanged(tasks.reload));

  const today = ymd(new Date());
  const week = ymd(addDays(new Date(), 7));
  const all = tasks.data ?? [];
  const top = all.filter((t) => !t.parent_id);

  const list = useMemo(() => {
    const todo = top.filter((t) => t.status === "todo");
    switch (filter) {
      case "all":
        return todo;
      case "today":
        return todo.filter((t) => t.due && t.due <= today);
      case "upcoming":
        return todo.filter((t) => t.due && t.due <= week);
      case "nodate":
        return todo.filter((t) => !t.due);
      case "done":
        return top
          .filter((t) => t.status === "done")
          .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
      default:
        return todo.filter((t) => t.project_id === filter.slice(2));
    }
  }, [top, filter, today, week]);

  const groups = useMemo(() => {
    if (filter === "done") return [{ key: "Tamamlanan", items: list }];
    const map = new Map<string, Task[]>();
    for (const t of list) {
      const k = !t.due ? "Tarihsiz" : t.due < today ? "Gecikmiş" : relDay(t.due);
      map.set(k, [...(map.get(k) ?? []), t]);
    }
    return [...map.entries()].map(([key, items]) => ({ key, items }));
  }, [list, filter, today]);

  const counts = (f: Filter) => {
    const todo = top.filter((t) => t.status === "todo");
    if (f === "all") return todo.length;
    if (f === "today") return todo.filter((t) => t.due && t.due <= today).length;
    if (f === "upcoming") return todo.filter((t) => t.due && t.due <= week).length;
    if (f === "nodate") return todo.filter((t) => !t.due).length;
    if (f === "done") return null;
    return todo.filter((t) => t.project_id === f.slice(2)).length;
  };

  const subs = (id: string) => all.filter((t) => t.parent_id === id);

  const toggle = async (t: Task) => {
    try {
      await api(`/api/tasks/${t.id}`, { method: "PATCH", body: { status: t.status === "done" ? "todo" : "done" } });
      if (t.status === "todo" && t.repeat) toast("Tekrarlayan görev: bir sonraki oluşturuldu", "success");
      tasks.reload();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const plan = async (replan: boolean) => {
    setPlanning(true);
    try {
      const r = await api<{ planned: { late: boolean }[]; unplanned: unknown[] }>("/api/schedule", { body: { replan } });
      const late = r.planned.filter((p) => p.late).length;
      toast(
        `${r.planned.length} görev takvime yerleştirildi` +
          (late ? ` (${late} tanesi son tarihten sonra)` : "") +
          (r.unplanned.length ? `, ${r.unplanned.length} görev sığmadı` : ""),
        "success",
      );
      tasks.reload();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setPlanning(false);
    }
  };

  const addProject = async () => {
    if (!newProject.trim()) return;
    const color = PROJECT_COLORS[(projects.data?.length ?? 0) % PROJECT_COLORS.length];
    const p = await api<Project>("/api/projects", { body: { name: newProject, color } });
    setNewProject("");
    projects.reload();
    setFilter(`p:${p.id}`);
  };

  const removeProject = async (p: Project) => {
    if (!confirm(`"${p.name}" listesi silinsin mi? Görevler silinmez, listesiz kalır.`)) return;
    await api(`/api/projects/${p.id}`, { method: "DELETE" });
    if (filter === `p:${p.id}`) setFilter("all");
    projects.reload();
    tasks.reload();
  };

  const activeProject = filter.startsWith("p:") ? projects.data?.find((p) => p.id === filter.slice(2)) : undefined;
  const title = activeProject?.name ?? FILTERS.find((f) => f.id === filter)?.label ?? "Görevler";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 md:flex-row">
      <aside className="shrink-0 md:w-56">
        <div className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-visible">
          {FILTERS.map(({ id, label, icon: Icon }) => (
            <FilterButton key={id} active={filter === id} onClick={() => setFilter(id)} count={counts(id)}>
              <Icon size={16} /> {label}
            </FilterButton>
          ))}
        </div>
        <p className="label mt-5 hidden px-3 md:block">Listeler</p>
        <div className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-visible">
          {(projects.data ?? []).map((p) => (
            <div key={p.id} className="group relative shrink-0">
              <FilterButton active={filter === `p:${p.id}`} onClick={() => setFilter(`p:${p.id}`)} count={counts(`p:${p.id}`)}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} /> {p.name}
              </FilterButton>
              <button
                onClick={() => removeProject(p)}
                className="absolute right-9 top-2 hidden text-red-500 md:group-hover:block"
                aria-label="Listeyi sil"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-1">
          <input
            className="input py-1.5"
            placeholder="Yeni liste"
            value={newProject}
            onChange={(e) => setNewProject(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addProject()}
          />
          <button className="btn-ghost px-2" onClick={addProject} aria-label="Liste ekle">
            <Plus size={16} />
          </button>
        </div>
      </aside>

      <section className="min-w-0 flex-1 space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => plan(true)} disabled={planning} title="Gelecekteki otomatik blokları silip yeniden dağıtır">
              Yeniden planla
            </button>
            <button className="btn-primary" onClick={() => plan(false)} disabled={planning}>
              <Sparkles size={16} /> {planning ? "Planlanıyor…" : "Akıllı planla"}
            </button>
          </div>
        </header>
        {filter !== "done" && (
          <div className="card">
            <QuickAdd
              projects={projects.data ?? []}
              defaults={{ due: filter === "today" ? today : null, project_id: activeProject?.id ?? null }}
              onAdded={() => {
                tasks.reload();
                projects.reload();
              }}
            />
            <p className="muted mt-2 text-xs">
              İpucu: <b>yarın</b>, <b>cuma</b>, <b>15.10</b> · <b>45dk</b>, <b>1s</b> · <b>!1</b>–<b>!4</b> öncelik · <b>#liste</b> ·{" "}
              <b>her gün/hafta/ay</b>
            </p>
          </div>
        )}
        {tasks.loading && <div className="space-y-3" aria-busy="true" aria-label="Yükleniyor"><div className="skeleton h-16" /><div className="skeleton h-16" /><div className="skeleton h-16" /><div className="skeleton h-16" /></div>}
        {!tasks.loading && list.length === 0 && (
          <div className="card py-12 text-center">
            <ListTodo className="muted mx-auto mb-2" />
            <p className="muted text-sm">Burada görev yok.</p>
          </div>
        )}
        {groups.map((g) => (
          <div key={g.key} className="card">
            <h3 className={`mb-1 px-2 text-sm font-semibold ${g.key === "Gecikmiş" ? "text-red-600" : ""}`}>
              {g.key} <span className="muted font-normal">· {g.items.length}</span>
            </h3>
            {g.items.map((t) => {
              const s = subs(t.id);
              return (
                <TaskItem
                  key={t.id}
                  task={t}
                  project={projects.data?.find((p) => p.id === t.project_id)}
                  onToggle={() => toggle(t)}
                  onClick={() => setEditing(t)}
                  subCount={{ done: s.filter((x) => x.status === "done").length, total: s.length }}
                />
              );
            })}
          </div>
        ))}
      </section>

      <TaskEditor
        task={editing}
        subtasks={editing ? subs(editing.id) : []}
        projects={projects.data ?? []}
        onClose={() => setEditing(null)}
        onChanged={tasks.reload}
      />
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number | null;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition ${
        active ? "bg-brand-50 font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-100" : "hover:bg-black/5 dark:hover:bg-white/5"
      }`}
    >
      {children}
      {count != null && count > 0 && <span className="muted ml-auto pl-2 text-xs">{count}</span>}
    </button>
  );
}

function TaskEditor({
  task,
  subtasks,
  projects,
  onClose,
  onChanged,
}: {
  task: Task | null;
  subtasks: Task[];
  projects: Project[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [form, setForm] = useState<Partial<Task>>({});
  const [sub, setSub] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (task) setForm(task);
  }, [task]);

  if (!task) return null;
  const set = (patch: Partial<Task>) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    setBusy(true);
    try {
      await api(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: {
          title: form.title,
          notes: form.notes,
          priority: form.priority,
          due: form.due || null,
          duration_min: form.duration_min,
          project_id: form.project_id || null,
          repeat: form.repeat || null,
          chunk_min: form.chunk_min || null,
          time_pref: form.time_pref || null,
        },
      });
      onChanged();
      onClose();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    await api(`/api/tasks/${task.id}`, { method: "DELETE" });
    toast("Görev silindi");
    onChanged();
    onClose();
  };

  const scheduleThis = async () => {
    setBusy(true);
    try {
      await save();
      const r = await api<{ planned: { start: string }[]; unplanned: { minutesLeft: number }[] }>("/api/schedule", { body: { taskIds: [task.id] } });
      const first = r.planned[0];
      toast(
        first
          ? `${r.planned.length > 1 ? `${r.planned.length} parça planlandı, ilki ` : "Planlandı: "}${new Date(first.start).toLocaleString("tr-TR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}${r.unplanned.length ? ` · ${r.unplanned[0].minutesLeft} dk sığmadı` : ""}`
          : "Uygun boş zaman bulunamadı (günlük sınır ya da planlama saatleri dolu olabilir)",
        first ? "success" : "error",
      );
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const unschedule = async () => {
    await api(`/api/tasks/${task.id}?only=blocks`, { method: "DELETE" });
    toast("Gelecekteki zaman blokları takvimden kaldırıldı");
    onChanged();
    onClose();
  };

  const addSub = async () => {
    if (!sub.trim()) return;
    await api("/api/tasks", { body: { title: sub, parent_id: task.id, project_id: task.project_id, due: task.due, duration_min: 30 } });
    setSub("");
    onChanged();
  };

  const toggleSub = async (s: Task) => {
    await api(`/api/tasks/${s.id}`, { method: "PATCH", body: { status: s.status === "done" ? "todo" : "done" } });
    onChanged();
  };

  return (
    <Modal open onClose={onClose} title="Görevi düzenle" wide>
      <div className="space-y-3">
        <input className="input text-base font-medium" value={form.title ?? ""} onChange={(e) => set({ title: e.target.value })} />
        <textarea
          className="input min-h-20"
          placeholder="Notlar"
          value={form.notes ?? ""}
          onChange={(e) => set({ notes: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <span className="label">Son tarih</span>
            <input type="date" className="input" value={form.due ?? ""} onChange={(e) => set({ due: e.target.value || null })} />
          </div>
          <div>
            <span className="label">Süre (dk)</span>
            <input
              type="number"
              min={5}
              step={5}
              className="input"
              value={form.duration_min ?? 30}
              onChange={(e) => set({ duration_min: Number(e.target.value) })}
            />
          </div>
          <div>
            <span className="label">Öncelik</span>
            <select className="input" value={form.priority ?? 4} onChange={(e) => set({ priority: Number(e.target.value) })}>
              {[1, 2, 3, 4].map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="label">Liste</span>
            <select className="input" value={form.project_id ?? ""} onChange={(e) => set({ project_id: e.target.value || null })}>
              <option value="">Yok</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="label">Parçalara böl</span>
            <select className="input" value={form.chunk_min ?? ""} onChange={(e) => set({ chunk_min: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Tek blok</option>
              {[30, 45, 60, 90, 120].map((m) => (
                <option key={m} value={m}>
                  {m} dk parçalar
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="label">Zaman tercihi</span>
            <select className="input" value={form.time_pref ?? ""} onChange={(e) => set({ time_pref: (e.target.value || null) as Task["time_pref"] })}>
              <option value="">Fark etmez</option>
              {Object.entries(TIME_PREFS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="label">Tekrar</span>
            <select
              className="input"
              value={form.repeat ?? ""}
              onChange={(e) => set({ repeat: (e.target.value || null) as Task["repeat"] })}
            >
              <option value="">Yok</option>
              <option value="daily">Her gün</option>
              <option value="weekly">Her hafta</option>
              <option value="monthly">Her ay</option>
            </select>
          </div>
        </div>

        <div className="rounded-xl border border-theme p-3">
          <p className="mb-2 text-sm font-semibold">Alt görevler</p>
          {subtasks.map((s) => (
            <label key={s.id} className="flex items-center gap-2 py-1 text-sm">
              <input type="checkbox" checked={s.status === "done"} onChange={() => toggleSub(s)} />
              <span className={s.status === "done" ? "muted line-through" : ""}>{s.title}</span>
            </label>
          ))}
          <div className="mt-2 flex gap-2">
            <input
              className="input py-1.5"
              placeholder="Alt görev ekle"
              value={sub}
              onChange={(e) => setSub(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addSub()}
            />
            <button className="btn-ghost px-2" onClick={addSub} aria-label="Alt görev ekle">
              <Plus size={16} />
            </button>
          </div>
        </div>

        <div className="surface-2 rounded-xl p-3 text-xs">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="font-semibold">Takvimde ayrılan süre</span>
            <span className="tabular-nums">
              {task.scheduled_min ?? 0} / {form.duration_min ?? task.duration_min} dk
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
            <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.min(100, ((task.scheduled_min ?? 0) / (form.duration_min || task.duration_min)) * 100)}%` }} />
          </div>
          <p className="muted mt-1.5">
            {task.event_start
              ? `Sıradaki blok: ${new Date(task.event_start).toLocaleString("tr-TR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}`
              : "Henüz takvime yerleştirilmedi"}
            {form.chunk_min ? ` · ${form.chunk_min} dakikalık parçalarla, mümkünse farklı günlere dağıtılır` : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <button className="btn-danger" onClick={remove}>
            <Trash2 size={16} /> Sil
          </button>
          <div className="flex flex-wrap gap-2">
            {(task.scheduled_min ?? 0) > 0 && (
              <button className="btn-ghost" onClick={unschedule} disabled={busy}>
                <CalendarX size={16} /> Takvimden kaldır
              </button>
            )}
            {task.status === "todo" && (task.scheduled_min ?? 0) < (form.duration_min ?? task.duration_min) && (
              <button className="btn-ghost" onClick={scheduleThis} disabled={busy}>
                <Sparkles size={16} /> {(task.scheduled_min ?? 0) > 0 ? "Kalanı yerleştir" : "Boş zamana yerleştir"}
              </button>
            )}
            <button className="btn-primary" onClick={save} disabled={busy}>
              Kaydet
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
