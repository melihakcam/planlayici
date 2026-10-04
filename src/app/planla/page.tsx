"use client";

import { CalendarCheck, Coffee, Minus, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { emitChanged, toast } from "@/components/toast";
import { addDays, api, fmtDate, fmtTime, useApi, ymd } from "@/lib/client";

type Win = { start: string; end: string };
type PlanProject = { id: string; name: string; color: string; area: string; selected: boolean; weekSessions: number; placed: number };
type PlanData = {
  week: string;
  date: string;
  sessionMin: number;
  breakMin: number;
  defaultWindows: Win[];
  projects: PlanProject[];
  daySessions: { id: string; title: string; start: string; end: string; projectId: string }[];
};
type Preview = { placed: { projectId: string; title: string; color: string; start: string; end: string }[]; unplaced: string[] };
type Tab = "hafta" | "yarin" | "bugun";

const TABS: { key: Tab; label: string }[] = [
  { key: "hafta", label: "Bu hafta" },
  { key: "yarin", label: "Yarın" },
  { key: "bugun", label: "Bugün" },
];

export default function PlanPage() {
  const today = ymd(new Date());
  const [tab, setTab] = useState<Tab>("bugun");
  const week = useApi<PlanData>(`/api/oturum?date=${today}`);

  // Bu hafta için hiç proje seçilmemişse önce haftalık seçim açılır
  useEffect(() => {
    if (week.data && !week.data.projects.some((p) => p.selected)) setTab("hafta");
  }, [week.data]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">

      <header className="hero-gradient glow animate-rise relative overflow-hidden rounded-3xl p-6 text-white md:p-7">
        <span className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/20 blur-3xl" aria-hidden />
        <p className="relative text-sm font-medium text-white/80">{fmtDate(today, { weekday: "long", day: "numeric", month: "long" })}</p>
        <h1 className="relative text-3xl font-extrabold tracking-tight md:text-4xl">Planla</h1>
        <p className="relative mt-1 text-white/90">Bu hafta neye çalışıyoruz, yarın ve bugün ne yapıyoruz?</p>
        <div className="relative mt-5 inline-flex gap-1 rounded-2xl bg-white/15 p-1 ring-1 ring-white/25 backdrop-blur-md" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`min-h-11 rounded-xl px-5 text-sm font-semibold transition duration-200 ${
                tab === t.key ? "bg-white text-violet-700 shadow-lg" : "text-white hover:bg-white/15"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {!week.data ? (
        <div className="space-y-3" aria-busy="true" aria-label="Yükleniyor">
          <div className="skeleton h-20" />
          <div className="skeleton h-20" />
          <div className="skeleton h-20" />
        </div>
      ) : tab === "hafta" ? (
        <WeekPicker data={week.data} onSaved={() => (week.reload(), setTab("bugun"))} />
      ) : (
        <DayPlanner key={tab} date={tab === "bugun" ? today : ymd(addDays(new Date(), 1))} isToday={tab === "bugun"} onGoWeek={() => setTab("hafta")} />
      )}
    </div>
  );
}

function Stepper({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <button className="btn-ghost h-11 w-11 rounded-full p-0" onClick={() => onChange(Math.max(0, value - 1))} aria-label="Azalt">
        <Minus size={16} />
      </button>
      <span className="w-8 text-center text-lg font-bold tabular-nums">{value}</span>
      <button className="btn-ghost h-11 w-11 rounded-full p-0" onClick={() => onChange(Math.min(40, value + 1))} aria-label="Artır">
        <Plus size={16} />
      </button>
    </div>
  );
}

function WeekPicker({ data, onSaved }: { data: PlanData; onSaved: () => void }) {
  const [counts, setCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(data.projects.map((p) => [p.id, p.weekSessions])),
  );
  const [saving, setSaving] = useState(false);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  const save = async () => {
    setSaving(true);
    try {
      await api("/api/oturum", {
        method: "PUT",
        body: { date: data.date, items: Object.entries(counts).map(([projectId, sessions]) => ({ projectId, sessions })) },
      });
      toast("Haftanın planı kaydedildi", "success");
      onSaved();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card animate-rise space-y-4">
      <div>
        <h2 className="text-lg font-bold">Bu hafta hangi projelere çalışalım?</h2>
        <p className="muted text-sm">
          Her oturum {data.sessionMin} dakika. Seçmediğin projeler bu hafta planlanmaz. Toplam:{" "}
          <span className="font-semibold text-[var(--text)]">
            {total} oturum ≈ {Math.round((total * data.sessionMin) / 60)} saat
          </span>
        </p>
      </div>
      <ul className="stagger divide-y divide-[var(--border)]">
        {data.projects.map((p) => {
          const n = counts[p.id] ?? 0;
          return (
            <li key={p.id} className={`flex items-center gap-3 py-2 transition ${n ? "" : "opacity-70"}`}>
              <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ background: p.color }} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{p.name}</p>
                {p.placed > 0 && <p className="muted text-xs">Bu hafta {p.placed} oturum takvimde</p>}
              </div>
              <Stepper value={n} onChange={(v) => setCounts({ ...counts, [p.id]: v })} label={`${p.name} oturum sayısı`} />
            </li>
          );
        })}
      </ul>
      <button className="btn hero-gradient w-full text-base text-white shadow-lg" onClick={save} disabled={saving}>
        <CalendarCheck size={18} /> {saving ? "Kaydediliyor…" : "Haftayı kaydet"}
      </button>
    </section>
  );
}

function DayPlanner({ date, isToday, onGoWeek }: { date: string; isToday: boolean; onGoWeek: () => void }) {
  const day = useApi<PlanData>(`/api/oturum?date=${date}`);
  const [windows, setWindows] = useState<Win[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [showAll, setShowAll] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [saving, setSaving] = useState(false);

  // İlk yüklemede: varsayılan boş saatler, o günün mevcut oturum sayıları
  useEffect(() => {
    if (!day.data || windows) return;
    setWindows(day.data.defaultWindows);
    const c: Record<string, number> = {};
    for (const s of day.data.daySessions) c[s.projectId] = (c[s.projectId] ?? 0) + 1;
    setCounts(c);
  }, [day.data, windows]);

  const items = useMemo(() => Object.entries(counts).map(([projectId, sessions]) => ({ projectId, sessions })), [counts]);
  const total = items.reduce((a, i) => a + i.sessions, 0);

  // Önizleme: her değişiklikte sunucuya sorulur (kaydetmeden)
  useEffect(() => {
    if (!windows) return;
    const t = setTimeout(() => {
      api<Preview>("/api/oturum", { method: "POST", body: { date, windows, items, dryRun: true } })
        .then(setPreview)
        .catch(() => setPreview(null));
    }, 250);
    return () => clearTimeout(t);
  }, [date, windows, items]);

  if (!day.data || !windows)
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Yükleniyor">
        <div className="skeleton h-32" />
        <div className="skeleton h-48" />
      </div>
    );

  const d = day.data;
  const weekProjects = d.projects.filter((p) => p.selected);
  const shown = showAll || !weekProjects.length ? d.projects : weekProjects;
  const dayLabel = isToday ? "Bugün" : "Yarın";

  const commit = async () => {
    setSaving(true);
    try {
      const r = await api<Preview>("/api/oturum", { method: "POST", body: { date, windows, items, dryRun: false } });
      toast(`${r.placed.length} oturum takvime yerleştirildi${r.unplaced.length ? `, ${r.unplaced.length} oturum sığmadı` : ""}`, "success");
      emitChanged();
      day.reload();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  const setWin = (i: number, w: Partial<Win>) => setWindows(windows.map((x, j) => (j === i ? { ...x, ...w } : x)));

  // Takvimde ardışık oturumlar arasına mola satırı koy
  const rows: ({ kind: "s"; s: Preview["placed"][number] } | { kind: "b"; min: number })[] = [];
  (preview?.placed ?? []).forEach((s, i, arr) => {
    if (i > 0) {
      const gap = Math.round((Date.parse(s.start) - Date.parse(arr[i - 1].end)) / 60_000);
      if (gap > 0) rows.push({ kind: "b", min: gap });
    }
    rows.push({ kind: "s", s });
  });

  return (
    <div className="stagger space-y-6">
      <section className="card lift space-y-3">
        <h2 className="text-lg font-bold">{dayLabel} kaçtan kaça boşsun?</h2>
        {windows.map((w, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input type="time" className="input w-32" value={w.start} onChange={(e) => setWin(i, { start: e.target.value })} aria-label="Başlangıç" />
            <span className="muted">–</span>
            <input type="time" className="input w-32" value={w.end} onChange={(e) => setWin(i, { end: e.target.value })} aria-label="Bitiş" />
            {windows.length > 1 && (
              <button className="btn-danger h-11 w-11 p-0" onClick={() => setWindows(windows.filter((_, j) => j !== i))} aria-label="Aralığı sil">
                <Trash2 size={16} />
              </button>
            )}
          </div>
        ))}
        <button className="btn-ghost" onClick={() => setWindows([...windows, { start: "18:00", end: "19:00" }])}>
          <Plus size={16} /> Başka aralık ekle
        </button>
        <p className="muted text-xs">Dersler, kurs ve takvimdeki diğer etkinliklerle çakışan saatler otomatik atlanır.</p>
      </section>

      <section className="card lift space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">{dayLabel} neye çalışalım?</h2>
          <span className="muted text-sm">{total} oturum · {d.sessionMin} dk</span>
        </div>
        {!weekProjects.length && (
          <p className="text-sm">
            Bu hafta için proje seçmedin.{" "}
            <button className="font-semibold text-violet-600 hover:underline" onClick={onGoWeek}>
              Haftayı planla
            </button>
          </p>
        )}
        <ul className="divide-y divide-[var(--border)]">
          {shown.map((p) => {
            const n = counts[p.id] ?? 0;
            return (
              <li key={p.id} className={`flex items-center gap-3 py-2 transition ${n ? "" : "opacity-70"}`}>
                <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ background: p.color }} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{p.name}</p>
                  {p.selected && (
                    <p className="muted text-xs">
                      Bu hafta {p.placed}/{p.weekSessions} oturum takvimde
                    </p>
                  )}
                </div>
                <Stepper value={n} onChange={(v) => setCounts({ ...counts, [p.id]: v })} label={`${p.name} oturum sayısı`} />
              </li>
            );
          })}
        </ul>
        {weekProjects.length > 0 && weekProjects.length < d.projects.length && (
          <button className="text-sm font-semibold text-violet-600 hover:underline" onClick={() => setShowAll(!showAll)}>
            {showAll ? "Sadece bu haftanın projeleri" : "Diğer projeleri de göster"}
          </button>
        )}
      </section>

      <section className="card lift gradient-border space-y-3">
        <h2 className="text-lg font-bold">Önizleme</h2>
        {total === 0 && <p className="muted text-sm">Yukarıdan oturum ekle, burada saatleriyle görünecek.</p>}
        <ol className="space-y-1.5">
          {rows.map((r, i) =>
            r.kind === "s" ? (
              <li key={i} className="flex items-center gap-3 rounded-xl px-3 py-2" style={{ background: `${r.s.color}1a` }}>
                <span className="w-28 shrink-0 text-sm font-semibold tabular-nums">
                  {fmtTime(r.s.start)}–{fmtTime(r.s.end)}
                </span>
                <span className="h-5 w-1 rounded-full" style={{ background: r.s.color }} aria-hidden />
                <span className="font-medium">{r.s.title}</span>
              </li>
            ) : (
              <li key={i} className="muted flex items-center gap-2 px-3 text-xs">
                <Coffee size={12} aria-hidden /> {r.min} dk {r.min > 15 ? "ara" : "mola"}
              </li>
            ),
          )}
        </ol>
        {preview && preview.unplaced.length > 0 && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            {preview.unplaced.length} oturum boş saatlere sığmadı ({[...new Set(preview.unplaced)].join(", ")}). Aralığı genişlet ya da oturum azalt.
          </p>
        )}
        {d.daySessions.length > 0 && (
          <p className="muted text-xs">{dayLabel} için zaten {d.daySessions.length} oturum var; yerleştirince bunların yerine geçer.</p>
        )}
        <button className="btn hero-gradient cta-pulse w-full text-base text-white shadow-lg" onClick={commit} disabled={saving || !preview}>
          <CalendarCheck size={18} /> {saving ? "Yerleştiriliyor…" : "Takvime yerleştir"}
        </button>
      </section>
    </div>
  );
}
