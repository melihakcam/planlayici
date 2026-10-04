"use client";

import { ArrowRight, CalendarClock, Check, CheckCircle2, Flame, Moon, Timer, Trophy, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { celebrate } from "@/components/celebrate";
import { Ring } from "@/components/ProgressBadge";
import { emitChanged, toast } from "@/components/toast";
import { api, fmtMinutes, fmtTime, useApi } from "@/lib/client";
import type { Progress } from "@/lib/progress";
import type { Task } from "@/lib/types";
import { XP } from "@/lib/xp";

type CloseData = {
  date: string;
  closedAt: string | null;
  reflection: string;
  done: Task[];
  left: Task[];
  progress: Progress;
  habits: { id: string; name: string; icon: string; done: boolean }[];
  tomorrow: { events: { id: string; title: string; start: string; all_day: number; task_id: string | null }[]; due: { id: string; title: string }[] };
};
type Action = "tomorrow" | "later" | "done";

const STEPS = ["Bugün ne yaptın?", "Kalanlar", "Yansıma"];
const MOODS = [
  { v: 1, e: "😞", l: "Kötü" },
  { v: 2, e: "😕", l: "İdare eder" },
  { v: 3, e: "😐", l: "Normal" },
  { v: 4, e: "🙂", l: "İyi" },
  { v: 5, e: "😄", l: "Harika" },
];

/** Akşam kapanış ritüeli (Sunsama esinli): günü değerlendir, kalanlara karar ver, yarına temiz başla. */
export default function ClosePage() {
  const data = useApi<CloseData>("/api/close");
  const [step, setStep] = useState(0);
  const [moves, setMoves] = useState<Record<string, Action>>({});
  const [reflection, setReflection] = useState("");
  const [mood, setMood] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);

  const d = data.data;
  useEffect(() => {
    if (d) setReflection(d.reflection);
  }, [d]);

  if (!d)
    return (
      <div className="mx-auto max-w-3xl space-y-4" aria-busy="true">
        <div className="skeleton h-10 w-56" />
        <div className="skeleton h-72" />
      </div>
    );

  const p = d.progress;
  const allDecided = d.left.every((t) => moves[t.id]);

  const finish = async () => {
    setBusy(true);
    try {
      await api("/api/close", {
        body: { reflection, mood, moves: Object.entries(moves).map(([id, action]) => ({ id, action })) },
      });
      emitChanged();
      setFinished(true);
      celebrate(`Günü kapattın! +${XP.close} XP`);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  if (finished)
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <section className="card animate-rise space-y-4 text-center">
          <Moon className="mx-auto text-brand-600" size={36} />
          <h1 className="text-2xl font-extrabold">İyi dinlenmeler</h1>
          <p className="muted">Bugünü kapattın. Yarın sabah planın hazır olacak.</p>
        </section>
        <Tomorrow d={d} />
        <div className="flex justify-center">
          <Link href="/" className="btn-primary">
            Bugün sayfasına dön <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="muted text-sm">{new Date().toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" })}</p>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
          <Moon className="text-brand-600" /> Günü kapat
        </h1>
        {d.closedAt && <p className="muted mt-1 text-xs">Bugünü {fmtTime(d.closedAt)} itibarıyla kapatmıştın; yeniden düzenleyebilirsin.</p>}
      </header>

      <ol className="flex gap-1" aria-label="Adımlar">
        {STEPS.map((s, i) => (
          <li key={s} className="flex-1" aria-current={i === step ? "step" : undefined}>
            <div className={`h-1.5 rounded-full ${i <= step ? "bg-brand-600" : "bg-black/10 dark:bg-white/10"}`} />
            <p className={`mt-1 hidden text-xs sm:block ${i === step ? "font-semibold" : "muted"}`}>{s}</p>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className="card animate-rise space-y-5">
          <div className="flex flex-wrap items-center gap-5">
            <Ring value={p.today.score} size={112} stroke={10} label={`Günlük hedefin yüzde ${Math.round(p.today.score * 100)}`}>
              <span className="text-2xl font-extrabold tabular-nums">{Math.round(p.today.score * 100)}%</span>
            </Ring>
            <dl className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat icon={<CheckCircle2 size={16} />} label="Tamamlanan" value={String(d.done.length)} />
              <Stat icon={<Timer size={16} />} label="Odak" value={fmtMinutes(p.today.focusMinutes)} />
              <Stat icon={<Trophy size={16} />} label="Bugün XP" value={`+${p.xpToday}`} />
              <Stat icon={<Flame size={16} />} label="Seri" value={`${p.streak} gün`} />
            </dl>
          </div>
          <div>
            <h2 className="mb-2 font-semibold">Bugün bitirdiklerin</h2>
            {d.done.length === 0 ? (
              <p className="muted text-sm">Bugün tamamlanan iş yok. Olsun; yarın yeni bir gün.</p>
            ) : (
              <ul className="space-y-1">
                {d.done.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 text-sm">
                    <Check size={16} className="shrink-0 text-success-600" /> {t.title}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {d.habits.length > 0 && (
            <div>
              <h2 className="mb-2 font-semibold">Alışkanlıklar</h2>
              <div className="flex flex-wrap gap-2">
                {d.habits.map((h) => (
                  <span key={h.id} className={`chip px-3 py-1 ${h.done ? "bg-emerald-100 text-success-600 dark:bg-emerald-500/15 dark:text-success-500" : "surface-2 muted"}`}>
                    {h.done ? <Check size={12} /> : <X size={12} />} {h.name}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-end">
            <button className="btn-primary" onClick={() => setStep(1)}>
              Devam <ArrowRight size={16} />
            </button>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="card animate-rise space-y-3">
          <div>
            <h2 className="font-semibold">Bugünden kalanlar</h2>
            <p className="muted text-sm">Her biri için bir karar ver; yarın sabah temiz bir listeyle başla.</p>
          </div>
          {d.left.length === 0 && <p className="py-6 text-center text-sm">Bugüne ait yapılmamış iş yok.</p>}
          <ul className="space-y-2">
            {d.left.map((t) => (
              <li key={t.id} className="rounded-xl border border-theme p-3">
                <p className="text-sm font-medium">{t.title}</p>
                <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label={`${t.title} için karar`}>
                  {(
                    [
                      ["tomorrow", "Yarın yap"],
                      ["later", "Sonra"],
                      ["done", "Aslında yaptım"],
                    ] as [Action, string][]
                  ).map(([a, label]) => (
                    <button
                      key={a}
                      role="radio"
                      aria-checked={moves[t.id] === a}
                      onClick={() => setMoves((m) => ({ ...m, [t.id]: a }))}
                      className={`btn min-h-9 px-3 text-xs ${moves[t.id] === a ? "bg-brand-600 text-white" : "border border-theme"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <div className="flex justify-between">
            <button className="btn-ghost" onClick={() => setStep(0)}>
              Geri
            </button>
            <button className="btn-primary" onClick={() => setStep(2)} disabled={!allDecided}>
              {allDecided ? "Devam" : `${d.left.filter((t) => !moves[t.id]).length} karar kaldı`} <ArrowRight size={16} />
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="card animate-rise space-y-4">
          <div>
            <span className="label">Bugün nasıl geçti?</span>
            <div className="flex gap-2" role="radiogroup" aria-label="Ruh hali">
              {MOODS.map((m) => (
                <button
                  key={m.v}
                  role="radio"
                  aria-checked={mood === m.v}
                  aria-label={m.l}
                  title={m.l}
                  onClick={() => setMood(mood === m.v ? null : m.v)}
                  className={`grid h-12 w-12 place-items-center rounded-xl text-2xl transition ${mood === m.v ? "scale-110 bg-brand-100 ring-2 ring-brand-500 dark:bg-brand-500/20" : "opacity-60 hover:opacity-100"}`}
                >
                  {m.e}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="label">Ne iyi gitti? Ne öğrendin? Yarın neyi farklı yaparsın?</span>
            <textarea className="input min-h-32" value={reflection} onChange={(e) => setReflection(e.target.value)} placeholder="Kısa bir not yeter." />
          </label>
          <Tomorrow d={d} />
          <div className="flex justify-between">
            <button className="btn-ghost" onClick={() => setStep(1)}>
              Geri
            </button>
            <button className="btn-primary" onClick={finish} disabled={busy}>
              <Moon size={16} /> {busy ? "Kaydediliyor…" : "Günü kapat"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="surface-2 rounded-xl px-3 py-2">
      <dt className="muted flex items-center gap-1.5 text-xs font-semibold">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 text-base font-bold tabular-nums">{value}</dd>
    </div>
  );
}

function Tomorrow({ d }: { d: CloseData }) {
  const ev = d.tomorrow.events;
  return (
    <section className="surface-2 rounded-2xl p-4">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <CalendarClock size={16} className="text-brand-600" /> Yarın seni bekleyenler
      </h2>
      {ev.length === 0 && d.tomorrow.due.length === 0 ? (
        <p className="muted text-sm">Yarın için takvimde bir şey yok.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {ev.map((e) => (
            <li key={e.id} className="flex gap-3">
              <span className="muted w-12 shrink-0 tabular-nums">{e.all_day ? "Tüm gün" : fmtTime(e.start)}</span>
              <span className="min-w-0">{e.title}</span>
            </li>
          ))}
          {d.tomorrow.due.map((t) => (
            <li key={t.id} className="flex gap-3">
              <span className="w-12 shrink-0 text-xs font-semibold text-red-600 dark:text-red-400">Teslim</span>
              <span className="min-w-0">{t.title}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
