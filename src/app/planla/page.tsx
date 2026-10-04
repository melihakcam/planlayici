"use client";

import { ArrowRight, Check, CheckCircle2, Clock, MoveRight, Sparkles, Star, Sun } from "lucide-react";
import AreaIcon from "@/components/AreaIcon";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import QuickAdd from "@/components/QuickAdd";
import { emitChanged, toast } from "@/components/toast";
import { addDays, api, fmtMinutes, fmtTime, relDay, useApi, ymd } from "@/lib/client";
import { eventColor, PRIORITY_COLOR, type EventRow, type ProjectStats, type Suggestion, type Task } from "@/lib/types";

type PlanData = {
  date: string;
  plannedAt: string | null;
  leftovers: Task[];
  events: EventRow[];
  taskBlocks: EventRow[];
  freeMinutes: number;
  dailyMax: number;
  taskMinutesToday: number;
  suggestions: Suggestion[];
  today: Task[];
};
type PlanResult = {
  planned: { taskId: string; title: string; start: string; end: string; late: boolean }[];
  unplanned: { taskId: string; title: string }[];
};

const STEPS = ["Dünden kalanlar", "Bugünün programı", "Bugün ne yapacaksın?", "Hazır"];

export default function PlanPage() {
  const plan = useApi<PlanData>("/api/plan");
  const projects = useApi<ProjectStats[]>("/api/projects");
  const [step, setStep] = useState(0);
  const [handled, setHandled] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [top, setTop] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PlanResult | null>(null);
  const [inited, setInited] = useState(false);

  const d = plan.data;
  const today = ymd(new Date());
  const projectOf = (t: Task) => projects.data?.find((p) => p.id === t.project_id);

  // Bugüne zaten ayrılmış işler önceden seçili gelsin; kalan yoksa ilk adımı atla.
  useEffect(() => {
    if (!d || inited) return;
    setSelected(new Set(d.today.map((t) => t.id)));
    setTop(d.today.filter((t) => t.top_date === today).map((t) => t.id).slice(0, 3));
    if (d.leftovers.length === 0) setStep(1);
    setInited(true);
  }, [d, inited, today]);

  // Öneriler + bugüne ayrılmış ama öneride olmayan işler
  const candidates = useMemo(() => {
    if (!d) return [] as Suggestion[];
    const ids = new Set(d.suggestions.map((s) => s.task.id));
    const extra = d.today.filter((t) => !ids.has(t.id)).map((task) => ({ task, score: 999, reasons: ["Bugüne ayrılmış"] }));
    return [...extra, ...d.suggestions];
  }, [d]);

  const selectedMinutes = candidates
    .filter((c) => selected.has(c.task.id) && !(c.task.event_start && ymd(new Date(c.task.event_start)) === today))
    // Parçalı işte bugüne bir parça girer; kalan süre diğer günlere dağılır.
    .reduce((a, c) => a + Math.min(c.task.chunk_min ?? Infinity, c.task.duration_min - (c.task.scheduled_min ?? 0)), 0);
  const free = d?.freeMinutes ?? 0;
  const dailyLeft = d?.dailyMax ? Math.max(0, d.dailyMax - d.taskMinutesToday) : Infinity;
  const capacity = Math.min(free, dailyLeft);
  const ratio = capacity ? selectedMinutes / capacity : selectedMinutes ? 2 : 0;

  const leftoverAction = async (t: Task, action: "today" | "tomorrow" | "nodate" | "done") => {
    const body =
      action === "done"
        ? { status: "done" }
        : action === "today"
          ? { planned_date: today }
          : action === "tomorrow"
            ? { planned_date: ymd(addDays(new Date(), 1)), due: t.due && t.due < today ? ymd(addDays(new Date(), 1)) : t.due }
            : { planned_date: null, due: null };
    try {
      await api(`/api/tasks/${t.id}`, { method: "PATCH", body });
      setHandled((h) => new Set(h).add(t.id));
      if (action === "today") setSelected((s) => new Set(s).add(t.id));
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) {
        n.delete(id);
        setTop((t) => t.filter((x) => x !== id));
      } else n.add(id);
      return n;
    });

  const toggleTop = (id: string) => {
    setSelected((s) => new Set(s).add(id));
    setTop((t) => (t.includes(id) ? t.filter((x) => x !== id) : t.length >= 3 ? [...t.slice(1), id] : [...t, id]));
  };

  const commit = async () => {
    setBusy(true);
    try {
      const r = await api<PlanResult>("/api/plan", { body: { taskIds: [...selected], topIds: top } });
      setResult(r);
      setStep(3);
      emitChanged();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const deferUnplanned = async () => {
    if (!result) return;
    const tomorrow = ymd(addDays(new Date(), 1));
    await Promise.all(
      result.unplanned.map((u) => api(`/api/tasks/${u.taskId}`, { method: "PATCH", body: { planned_date: tomorrow } })),
    );
    toast(`${result.unplanned.length} iş yarına ertelendi`, "success");
    setResult({ ...result, unplanned: [] });
  };

  if (!d) return <div className="muted p-8 text-sm">{plan.error ?? "Gününüz hazırlanıyor…"}</div>;

  const leftovers = d.leftovers.filter((t) => !handled.has(t.id));
  const fixed = [...d.events, ...d.taskBlocks].sort((a, b) => a.start_ms - b.start_ms);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="muted text-sm">{new Date().toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" })}</p>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Sun className="text-amber-500" /> Günü planla
        </h1>
        {d.plannedAt && step < 3 && (
          <p className="muted mt-1 text-xs">Bugünün planı hazır (son düzenleme: {fmtTime(d.plannedAt)}). İstersen yeniden düzenleyebilirsin.</p>
        )}
      </header>

      {/* Adım göstergesi */}
      <ol className="flex gap-1">
        {STEPS.map((s, i) => (
          <li key={s} className="flex-1">
            <div className={`h-1.5 rounded-full ${i <= step ? "bg-brand-600" : "bg-black/10 dark:bg-white/10"}`} />
            <p className={`mt-1 hidden text-xs sm:block ${i === step ? "font-semibold" : "muted"}`}>{s}</p>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className="card space-y-3">
          <div>
            <h2 className="font-semibold">Dünden kalanlar</h2>
            <p className="muted text-sm">Yapılamamış işler birikmesin; her biri için bir karar ver.</p>
          </div>
          {leftovers.length === 0 && <p className="py-6 text-center text-sm">Hepsi halledildi</p>}
          <ul className="space-y-2">
            {leftovers.map((t) => (
              <li key={t.id} className="rounded-xl border border-theme p-3">
                <div className="flex items-start gap-2">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: PRIORITY_COLOR[t.priority] }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{t.title}</p>
                    <p className="muted text-xs">
                      {t.due && t.due < today ? `Son tarih ${relDay(t.due)} geçti · ` : ""}
                      {projectOf(t)?.name ?? "Projesiz"} · {fmtMinutes(t.duration_min)}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button className="btn-primary px-2.5 py-1 text-xs" onClick={() => leftoverAction(t, "today")}>
                    Bugün yap
                  </button>
                  <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => leftoverAction(t, "tomorrow")}>
                    Yarına ertele
                  </button>
                  <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => leftoverAction(t, "nodate")}>
                    Tarihi kaldır
                  </button>
                  <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => leftoverAction(t, "done")}>
                    <Check size={12} /> Zaten yaptım
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex justify-end">
            <button className="btn-primary" onClick={() => setStep(1)}>
              Devam <ArrowRight size={16} />
            </button>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="card space-y-4">
          <div>
            <h2 className="font-semibold">Bugünün programı</h2>
            <p className="muted text-sm">Sabit işlerin (ders, toplantı, randevu) Google Takvim&apos;den geliyor. Kalan boş zaman:</p>
          </div>
          <div className="rounded-xl bg-brand-50 p-4 text-center dark:bg-brand-500/10">
            <p className="text-3xl font-bold text-brand-700 dark:text-brand-100">{fmtMinutes(d.freeMinutes)}</p>
            <p className="muted text-xs">planlanabilir boş zaman (çalışma saatlerin içinde)</p>
          </div>
          {fixed.length === 0 ? (
            <p className="muted text-sm">Bugün takviminde sabit bir şey yok.</p>
          ) : (
            <ul className="space-y-1">
              {fixed.map((e) => (
                <li key={e.id} className="flex items-center gap-3 text-sm">
                  <span className="w-24 shrink-0 text-xs tabular-nums muted">
                    {e.all_day ? "Tüm gün" : `${fmtTime(e.start)}–${fmtTime(e.end)}`}
                  </span>
                  <span className="h-4 w-1 rounded-full" style={{ background: eventColor(e) }} />
                  <span className="min-w-0 flex-1 truncate">{e.title}</span>
                  {e.task_id && <span className="chip bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-100">Görev</span>}
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-between">
            <button className="btn-ghost" onClick={() => setStep(0)}>
              Geri
            </button>
            <button className="btn-primary" onClick={() => setStep(2)}>
              İşleri seç <ArrowRight size={16} />
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-4">
          <div className="card space-y-3">
            <div>
              <h2 className="font-semibold">Bugün ne yapacaksın?</h2>
              <p className="muted text-sm">
                Öneriler teslim tarihine, önceliğe ve projelerinin haftalık hedeflerine göre sıralandı. Yapacaklarını seç, en
                önemli <b>3</b> tanesini ⭐ ile işaretle; önce onlar yerleşir.
              </p>
            </div>
            {/* Kapasite çubuğu */}
            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span>
                  Seçilen: <b>{fmtMinutes(selectedMinutes)}</b>
                </span>
                <span className="muted">
                  Kapasite: {fmtMinutes(capacity)}
                  {dailyLeft < free ? ` (günlük sınır)` : ""}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
                <div
                  className={`h-full rounded-full transition-all ${ratio > 1 ? "bg-red-500" : ratio > 0.85 ? "bg-amber-500" : "bg-emerald-500"}`}
                  style={{ width: `${Math.min(100, ratio * 100)}%` }}
                />
              </div>
              {ratio > 1 && (
                <p className="mt-1 text-xs text-red-600">
                  Seçtiklerin kapasiteden {fmtMinutes(selectedMinutes - capacity)} fazla. Sığmayanlar yarına aktarılabilir.
                </p>
              )}
            </div>
            <QuickAdd
              projects={projects.data ?? []}
              defaults={{ due: null, planned_date: today }}
              placeholder="Listede olmayan bir iş ekle…"
              onAdded={(t) => {
                setSelected((s) => new Set(s).add(t.id));
                plan.reload();
              }}
            />
          </div>

          <ul className="space-y-2">
            {candidates.map(({ task: t, reasons }) => {
              const on = selected.has(t.id);
              const isTop = top.includes(t.id);
              const p = projectOf(t);
              const alreadyToday = t.event_start && ymd(new Date(t.event_start)) === today;
              return (
                <li
                  key={t.id}
                  className={`card flex items-start gap-3 p-3 transition ${on ? "ring-2 ring-brand-500" : ""}`}
                  onClick={() => toggle(t.id)}
                >
                  <span
                    className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 ${on ? "border-brand-600 bg-brand-600" : "border-theme"}`}
                  >
                    {on && <Check size={12} className="text-white" strokeWidth={3} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{t.title}</p>
                    <div className="mt-1 flex flex-wrap gap-1 text-xs">
                      <span className="muted">
                        <Clock size={11} className="mr-0.5 inline" />
                        {fmtMinutes(t.duration_min)}
                      </span>
                      {p && (
                        <span className="chip" style={{ background: `${p.color}22`, color: p.color }}>
                          <AreaIcon area={p.area} size={12} /> {p.name}
                        </span>
                      )}
                      {alreadyToday && <span className="chip bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15">Bugün {fmtTime(t.event_start!)}</span>}
                      {reasons.map((r) => (
                        <span key={r} className="chip bg-black/5 dark:bg-white/10">
                          {r}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleTop(t.id);
                    }}
                    className={`shrink-0 rounded-lg p-1.5 ${isTop ? "text-amber-500" : "muted hover:text-amber-500"}`}
                    aria-label="En önemli 3"
                    title="Günün en önemli 3 işi"
                  >
                    <Star size={18} fill={isTop ? "currentColor" : "none"} />
                  </button>
                </li>
              );
            })}
          </ul>
          {candidates.length === 0 && (
            <p className="card py-8 text-center text-sm muted">Bekleyen iş yok. Yukarıdan yeni bir iş ekleyebilirsin.</p>
          )}

          <div className="sticky bottom-20 flex justify-between gap-2 md:bottom-4">
            <button className="btn-ghost panel" onClick={() => setStep(1)}>
              Geri
            </button>
            <button className="btn-primary shadow-lg" onClick={commit} disabled={busy || selected.size === 0}>
              <Sparkles size={16} /> {busy ? "Yerleştiriliyor…" : `${selected.size} işi saatlere yerleştir`}
            </button>
          </div>
        </section>
      )}

      {step === 3 && result && (
        <section className="card space-y-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="text-emerald-500" size={28} />
            <div>
              <h2 className="font-semibold">Günün hazır!</h2>
              <p className="muted text-sm">İşler takvimine ve Google Takvim&apos;e eklendi.</p>
            </div>
          </div>
          {result.planned.length > 0 && (
            <ul className="space-y-1">
              {[...result.planned]
                .sort((a, b) => a.start.localeCompare(b.start))
                .map((p) => (
                  <li key={p.taskId} className="flex items-center gap-3 text-sm">
                    <span className="w-24 shrink-0 text-xs tabular-nums muted">
                      {fmtTime(p.start)}–{fmtTime(p.end)}
                    </span>
                    {top.includes(p.taskId) && <Star size={14} className="text-amber-500" fill="currentColor" />}
                    <span>{p.title}</span>
                  </li>
                ))}
            </ul>
          )}
          {result.unplanned.length > 0 && (
            <div className="rounded-xl bg-amber-50 p-3 text-sm dark:bg-amber-500/10">
              <p className="font-medium">Bugüne sığmayanlar ({result.unplanned.length}):</p>
              <p className="muted text-xs">{result.unplanned.map((u) => u.title).join(", ")}</p>
              <button className="btn-ghost mt-2 px-2.5 py-1 text-xs" onClick={deferUnplanned}>
                <MoveRight size={12} /> Yarına ertele
              </button>
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Link href="/takvim" className="btn-ghost">
              Takvimde gör
            </Link>
            <Link href="/" className="btn-primary">
              Güne başla <ArrowRight size={16} />
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
