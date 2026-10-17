"use client";

import { ArrowUpRight, Ban, CalendarClock, ChevronRight, FolderKanban, Lightbulb, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import QuickAdd from "@/components/QuickAdd";
import TaskItem from "@/components/TaskItem";
import { onChanged, toast } from "@/components/toast";
import { api, parseYmd, relDay, useApi, ymd } from "@/lib/client";
import { type ProjectStats, type Task } from "@/lib/types";

const COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#06b6d4", "#ef4444", "#8b5cf6", "#64748b"];
const STATUS_LABEL = { active: "Aktif", paused: "Beklemede", done: "Tamamlandı", red: "Red", fikir: "Fikir" } as const;

function daysLeft(date: string) {
  const diff = Math.round((parseYmd(date).getTime() - parseYmd(ymd(new Date())).getTime()) / 864e5);
  if (diff < 0) return { text: `${-diff} gün geçti`, cls: "text-red-600" };
  if (diff === 0) return { text: "Bugün", cls: "text-red-600" };
  return { text: `${diff} gün kaldı`, cls: diff <= 7 ? "text-amber-600" : "muted" };
}

export default function ProjectsPage() {
  const projects = useApi<ProjectStats[]>("/api/projects?fikirler=1");
  const tasks = useApi<Task[]>("/api/tasks");
  const [editing, setEditing] = useState<Partial<ProjectStats> | null>(null);

  useEffect(() =>
    onChanged(() => {
      projects.reload();
      tasks.reload();
    }),
  );

  const list = (projects.data ?? []).filter((p) => p.status === "active" || p.status === "paused");
  const completed = (projects.data ?? []).filter((p) => p.status === "done");
  const rejected = (projects.data ?? []).filter((p) => p.status === "red");
  const ideas = (projects.data ?? []).filter((p) => p.status === "fikir");
  const [idea, setIdea] = useState("");
  const [ideasOpen, setIdeasOpen] = useState(false);

  const addIdea = async () => {
    if (!idea.trim()) return;
    await api("/api/projects", { body: { name: idea.trim(), status: "fikir", color: COLORS[(projects.data?.length ?? 0) % COLORS.length] } });
    setIdea("");
    projects.reload();
  };
  const promote = async (p: ProjectStats) => {
    await api(`/api/projects/${p.id}`, { method: "PATCH", body: { status: "active" } });
    toast(`"${p.name}" artık bir proje`, "success");
    projects.reload();
  };
  const rejectIdea = async (p: ProjectStats) => {
    await api(`/api/projects/${p.id}`, { method: "PATCH", body: { status: "red" } });
    toast(`"${p.name}" Red'e taşındı`, "success");
    projects.reload();
  };
  const removeIdea = async (p: ProjectStats) => {
    if (!confirm(`"${p.name}" fikri silinsin mi?`)) return;
    await api(`/api/projects/${p.id}`, { method: "DELETE" });
    projects.reload();
  };
  const active = (projects.data ?? []).filter((p) => p.status === "active");
  const target = active.reduce((a, p) => a + p.weekly_hours, 0);
  const done = active.reduce((a, p) => a + p.week_done_h, 0);
  const planned = active.reduce((a, p) => a + p.week_planned_h, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Projeler</h1>
          <p className="muted text-sm">Her projeye haftalık bir saat hedefi ver; planlama dengeyi buna göre kurar.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-ghost" onClick={() => setIdeasOpen(true)}>
            <Lightbulb size={16} className="text-amber-500" /> Fikirler{ideas.length ? ` (${ideas.length})` : ""}
          </button>
          <button className="btn-primary" onClick={() => setEditing({ area: "kisisel", color: COLORS[(projects.data?.length ?? 0) % COLORS.length], status: "active", weekly_hours: 0 })}>
            <Plus size={16} /> Yeni proje
          </button>
        </div>
      </header>

      {target > 0 && (
        <section className="card">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="font-semibold">Bu hafta</h2>
            <span className="muted text-sm">
              {done} sa yapıldı · {planned} sa planlı · hedef {target} sa
            </span>
          </div>
          <Bar done={done} planned={planned} target={target} color="var(--primary)" />
        </section>
      )}

      {projects.data && list.length === 0 && (
        <div className="card py-12 text-center">
          <FolderKanban className="muted mx-auto mb-2" />
          <p className="muted text-sm">Henüz proje yok. "Yeni proje" ile ekle ya da Fikirler'den birini projeye dönüştür.</p>
        </div>
      )}

      {list.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((p) => (
            <ProjectCard key={p.id} p={p} onClick={() => setEditing(p)} />
          ))}
        </div>
      )}

      <Section title="Tamamlandı" items={completed} onEdit={setEditing} />
      <Section title="Red" items={rejected} onEdit={setEditing} />


      {/* Fikirler: aklına gelen, belki ileride proje olacak şeyler (planlamaya girmez) */}
      <Modal open={ideasOpen} onClose={() => setIdeasOpen(false)} title="Fikirler">
      <div className="space-y-3">
        <p className="muted text-sm">Aklına gelen proje fikirlerini yaz. Başlamaya karar verince projeye dönüştür; o zamana kadar planlamaya girmez.</p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addIdea();
          }}
        >
          <input autoFocus className="input" placeholder="Yeni fikir… (ör. tarla nem sensörüyle sulama uyarısı)" value={idea} onChange={(e) => setIdea(e.target.value)} aria-label="Yeni fikir" />
          <button className="btn-primary shrink-0" disabled={!idea.trim()}>
            <Plus size={16} /> Ekle
          </button>
        </form>
        {ideas.length === 0 && <p className="muted text-sm">Henüz fikir yok.</p>}
        <ul className="divide-y divide-[var(--border)]">
          {ideas.map((p) => (
            <li key={p.id} className="flex items-start gap-2 py-2">
              <button className="min-w-0 flex-1 rounded-lg py-1 text-left" onClick={() => (setIdeasOpen(false), setEditing(p))}>
                <p className="font-medium">{p.name}</p>
                {p.notes && <p className="muted line-clamp-2 text-xs">{p.notes}</p>}
              </button>
              <button className="btn-ghost shrink-0 text-xs" onClick={() => promote(p)} title="Projeye dönüştür">
                <ArrowUpRight size={14} /> Projeye dönüştür
              </button>
              <button className="btn-ghost shrink-0 text-xs" onClick={() => rejectIdea(p)} title="Red'e taşı">
                <Ban size={14} /> Reddet
              </button>
              <button className="btn-danger h-10 w-10 shrink-0 p-0" onClick={() => removeIdea(p)} aria-label={`"${p.name}" fikrini sil`}>
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      </div>
      </Modal>

      <ProjectEditor
        project={editing}
        tasks={(tasks.data ?? []).filter((t) => editing?.id && t.project_id === editing.id && !t.parent_id)}
        allProjects={projects.data ?? []}
        onClose={() => setEditing(null)}
        onChanged={() => {
          projects.reload();
          tasks.reload();
        }}
      />
    </div>
  );
}

function ProjectCard({ p, onClick }: { p: ProjectStats; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`card text-left transition hover:border-brand-500 ${p.status !== "active" ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-2">
        <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full" style={{ background: p.color }} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{p.name}</p>
          <p className="muted text-xs">
            {p.open_tasks} açık iş · {p.done_tasks} bitti
            {p.status !== "active" && ` · ${STATUS_LABEL[p.status]}`}
          </p>
        </div>
      </div>
      {p.deadline && (p.status === "active" || p.status === "paused") && (
        <p className={`mt-2 text-xs ${daysLeft(p.deadline).cls}`}>
          <CalendarClock size={12} className="mr-1 inline" />
          Teslim {relDay(p.deadline)} · {daysLeft(p.deadline).text}
        </p>
      )}
      {p.status === "done" || p.status === "red" ? (
        p.notes && <p className="muted mt-2 line-clamp-2 text-xs">{p.notes}</p>
      ) : p.weekly_hours > 0 ? (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs">
            <span className="muted">Bu hafta</span>
            <span className="tabular-nums">
              {p.week_done_h}
              {p.week_planned_h > 0 && <span className="muted"> +{p.week_planned_h}</span>} / {p.weekly_hours} sa
            </span>
          </div>
          <Bar done={p.week_done_h} planned={p.week_planned_h} target={p.weekly_hours} color={p.color} />
        </div>
      ) : (
        <p className="muted mt-3 text-xs">Haftalık hedef yok</p>
      )}
    </button>
  );
}

/** Katlanabilir bölüm (Tamamlandı / Red) */
function Section({ title, items, onEdit }: { title: string; items: ProjectStats[]; onEdit: (p: ProjectStats) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <section>
      <button className="flex items-center gap-1 font-semibold" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <ChevronRight size={18} className={`transition-transform ${open ? "rotate-90" : ""}`} />
        {title} <span className="muted font-normal">({items.length})</span>
      </button>
      {open && items.length === 0 && (
        <p className="muted mt-2 text-sm">Henüz yok. Bir projeyi açıp Durum'dan "{title}" seçince buraya taşınır.</p>
      )}
      {open && items.length > 0 && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <ProjectCard key={p.id} p={p} onClick={() => onEdit(p)} />
          ))}
        </div>
      )}
    </section>
  );
}

/** Yapılan (koyu) + planlanan (açık) / hedef */
function Bar({ done, planned, target, color }: { done: number; planned: number; target: number; color: string }) {
  const pct = (v: number) => `${Math.min(100, (v / Math.max(target, 0.01)) * 100)}%`;
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]" title={`${done} sa yapıldı, ${planned} sa planlı, hedef ${target} sa`}>
      <div style={{ width: pct(done), background: color }} />
      <div style={{ width: pct(Math.min(planned, Math.max(0, target - done))), background: color, opacity: 0.35 }} />
    </div>
  );
}

function ProjectEditor({
  project,
  tasks,
  allProjects,
  onClose,
  onChanged,
}: {
  project: Partial<ProjectStats> | null;
  tasks: Task[];
  allProjects: ProjectStats[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [f, setF] = useState<Partial<ProjectStats>>({});
  useEffect(() => {
    if (project) setF(project);
  }, [project]);
  if (!project) return null;
  const set = (p: Partial<ProjectStats>) => setF((x) => ({ ...x, ...p }));
  const isNew = !project.id;

  const save = async () => {
    if (!f.name?.trim()) return toast("Proje adı girin", "error");
    const body = { name: f.name, area: f.area, color: f.color, status: f.status, deadline: f.deadline || null, weekly_hours: f.weekly_hours, notes: f.notes };
    try {
      if (isNew) await api("/api/projects", { body });
      else await api(`/api/projects/${project.id}`, { method: "PATCH", body });
      toast(isNew ? "Proje oluşturuldu" : "Kaydedildi", "success");
      onChanged();
      onClose();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const remove = async () => {
    if (!confirm(`"${project.name}" silinsin mi? İşleri silinmez, projesiz kalır.`)) return;
    await api(`/api/projects/${project.id}`, { method: "DELETE" });
    onChanged();
    onClose();
  };

  const toggleTask = async (t: Task) => {
    await api(`/api/tasks/${t.id}`, { method: "PATCH", body: { status: t.status === "done" ? "todo" : "done" } });
    onChanged();
  };

  return (
    <Modal open onClose={onClose} title={isNew ? "Yeni proje" : (project.name ?? "Proje")} wide>
      <div className="space-y-4">
        <input autoFocus={isNew} className="input text-base font-medium" placeholder="Proje adı (ör. Çiftçi Takip, Bitirme Projesi)" value={f.name ?? ""} onChange={(e) => set({ name: e.target.value })} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label>
            <span className="label">Durum</span>
            <select className="input" value={f.status ?? "active"} onChange={(e) => set({ status: e.target.value as ProjectStats["status"] })}>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Teslim tarihi</span>
            <input type="date" className="input" value={f.deadline ?? ""} onChange={(e) => set({ deadline: e.target.value || null })} />
          </label>
          <label>
            <span className="label">Haftalık hedef (saat)</span>
            <input type="number" min={0} max={80} step={0.5} className="input" value={f.weekly_hours ?? 0} onChange={(e) => set({ weekly_hours: Number(e.target.value) })} />
          </label>
        </div>
        <div>
          <span className="label">Renk</span>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button key={c} onClick={() => set({ color: c })} className={`h-7 w-7 rounded-full ring-offset-2 ${f.color === c ? "ring-2 ring-brand-500" : ""}`} style={{ background: c }} aria-label={c} />
            ))}
          </div>
        </div>
        <textarea className="input min-h-16" placeholder="Notlar (fikrin detayı, hedef, bağlantılar…)" value={f.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} />

        {!isNew && (
          <div className="rounded-xl border border-theme p-3">
            <p className="mb-2 text-sm font-semibold">İşler</p>
            <QuickAdd projects={allProjects} defaults={{ project_id: project.id }} placeholder="Bu projeye iş ekle… (ör. API yaz 2s !2 cuma)" onAdded={onChanged} />
            <div className="mt-2 max-h-72 overflow-y-auto">
              {tasks.length === 0 && <p className="muted py-3 text-center text-sm">Henüz iş yok.</p>}
              {[...tasks]
                .sort((a, b) => (a.status === b.status ? 0 : a.status === "todo" ? -1 : 1))
                .map((t) => (
                  <TaskItem key={t.id} task={t} onToggle={() => toggleTask(t)} />
                ))}
            </div>
          </div>
        )}

        <div className="flex justify-between gap-2">
          {!isNew ? (
            <button className="btn-danger" onClick={remove}>
              <Trash2 size={16} /> Sil
            </button>
          ) : (
            <span />
          )}
          <button className="btn-primary" onClick={save}>
            {isNew ? "Oluştur" : "Kaydet"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
