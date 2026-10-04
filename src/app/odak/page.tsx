"use client";

import { Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/components/toast";
import { api, fmtMinutes, fmtTime, useApi } from "@/lib/client";
import type { Task } from "@/lib/types";

type Mode = "focus" | "short" | "long";
type State = { mode: Mode; endAt: number | null; remaining: number; taskId: string; cycles: number; startedAt: string | null };

const KEY = "planlayici:pomodoro";
const LABEL: Record<Mode, string> = { focus: "Odak", short: "Kısa mola", long: "Uzun mola" };

function beep() {
  try {
    const ctx = new AudioContext();
    [0, 0.25, 0.5].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.2, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.2);
    });
  } catch {}
}

export default function FocusPage() {
  const settings = useApi<{ pomodoroFocus: number; pomodoroBreak: number; pomodoroLong: number }>("/api/settings");
  const tasks = useApi<Task[]>("/api/tasks");
  const sessions = useApi<{ id: string; minutes: number; started_at: string; task_title: string | null }[]>("/api/focus?days=1");
  const [st, setSt] = useState<State | null>(null);
  const [now, setNow] = useState(Date.now());
  const finishing = useRef(false);

  const durations = useCallback(
    (m: Mode) => {
      const s = settings.data;
      return ((m === "focus" ? s?.pomodoroFocus : m === "short" ? s?.pomodoroBreak : s?.pomodoroLong) ?? 25) * 60_000;
    },
    [settings.data],
  );

  // Durumu geri yükle
  useEffect(() => {
    if (!settings.data || st) return;
    let saved: State | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(KEY) || "null");
    } catch {}
    setSt(saved ?? { mode: "focus", endAt: null, remaining: durations("focus"), taskId: "", cycles: 0, startedAt: null });
  }, [settings.data, st, durations]);

  useEffect(() => {
    if (!st) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(st));
    } catch {}
  }, [st]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const left = st ? (st.endAt ? Math.max(0, st.endAt - now) : st.remaining) : 0;

  const finish = useCallback(async () => {
    if (!st || finishing.current) return;
    finishing.current = true;
    beep();
    let cycles = st.cycles;
    // "Atla" ile erken bitirilirse yalnızca gerçekten geçen süre kaydedilir.
    const remainingNow = st.endAt ? Math.max(0, st.endAt - Date.now()) : st.remaining;
    const minutes = Math.round((durations(st.mode) - remainingNow) / 60_000);
    if (st.mode === "focus" && minutes >= 1) {
      cycles++;
      await api("/api/focus", { body: { taskId: st.taskId || null, minutes, startedAt: st.startedAt } }).catch(() => {});
      sessions.reload();
      if ("Notification" in window && Notification.permission === "granted") new Notification("Odak süresi bitti 🎉", { body: "Biraz mola ver." });
      toast(remainingNow > 0 ? `${minutes} dakikalık odak kaydedildi.` : "Odak oturumu tamamlandı! Mola zamanı.", "success");
    } else if (st.mode === "focus") {
      toast("1 dakikadan kısa oturumlar kaydedilmez.");
    } else {
      if ("Notification" in window && Notification.permission === "granted") new Notification("Mola bitti", { body: "Odaklanma zamanı." });
      toast("Mola bitti, hadi başlayalım!");
    }
    const next: Mode = st.mode === "focus" ? (cycles % 4 === 0 ? "long" : "short") : "focus";
    setSt({ ...st, mode: next, endAt: null, remaining: durations(next), cycles, startedAt: null });
    finishing.current = false;
  }, [st, durations, sessions]);

  useEffect(() => {
    if (st?.endAt && left <= 0) finish();
  }, [st?.endAt, left, finish]);

  useEffect(() => {
    document.title = st?.endAt ? `${fmt(left)} · ${LABEL[st.mode]}` : "Planlayıcı";
    return () => {
      document.title = "Planlayıcı";
    };
  }, [left, st?.endAt, st?.mode]);

  if (!st) return <div className="muted p-8 text-sm">Yükleniyor…</div>;

  const total = durations(st.mode);
  const progress = 1 - left / total;
  const running = Boolean(st.endAt);
  const todo = (tasks.data ?? []).filter((t) => t.status === "todo");
  const todayMin = (sessions.data ?? []).reduce((a, s) => a + s.minutes, 0);

  const start = () => setSt({ ...st, endAt: Date.now() + st.remaining, startedAt: st.startedAt ?? new Date().toISOString() });
  const pause = () => setSt({ ...st, endAt: null, remaining: left });
  const reset = () => setSt({ ...st, endAt: null, remaining: durations(st.mode), startedAt: null });
  const switchMode = (m: Mode) => setSt({ ...st, mode: m, endAt: null, remaining: durations(m), startedAt: null });

  const R = 120;
  const C = 2 * Math.PI * R;
  const color = st.mode === "focus" ? "#4f46e5" : "#10b981";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Odak</h1>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card flex flex-col items-center gap-6 py-8 lg:col-span-2">
          <div className="flex gap-1 rounded-xl bg-black/5 p-1 dark:bg-white/5">
            {(["focus", "short", "long"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${st.mode === m ? "panel shadow-sm" : "muted"}`}
              >
                {LABEL[m]}
              </button>
            ))}
          </div>
          <div className="relative">
            <svg width={280} height={280} className="-rotate-90">
              <circle cx={140} cy={140} r={R} fill="none" strokeWidth={10} className="stroke-black/[0.06] dark:stroke-white/[0.08]" />
              <circle
                cx={140}
                cy={140}
                r={R}
                fill="none"
                stroke={color}
                strokeWidth={10}
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - progress)}
                style={{ transition: "stroke-dashoffset .25s linear" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-6xl font-bold tabular-nums tracking-tight">{fmt(left)}</span>
              <span className="muted mt-1 text-sm">
                {LABEL[st.mode]} · #{st.cycles + (st.mode === "focus" ? 1 : 0)}
              </span>
            </div>
          </div>
          <select className="input max-w-sm" value={st.taskId} onChange={(e) => setSt({ ...st, taskId: e.target.value })}>
            <option value="">Görev seç (isteğe bağlı)</option>
            {todo.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          <div className="flex gap-3">
            <button className="btn-ghost h-12 w-12 rounded-full p-0" onClick={reset} aria-label="Sıfırla">
              <RotateCcw size={18} />
            </button>
            {running ? (
              <button className="btn-primary h-12 px-8 text-base" onClick={pause}>
                <Pause size={18} /> Duraklat
              </button>
            ) : (
              <button className="btn-primary h-12 px-8 text-base" onClick={start}>
                <Play size={18} /> Başlat
              </button>
            )}
            <button className="btn-ghost h-12 w-12 rounded-full p-0" onClick={finish} aria-label="Atla">
              <SkipForward size={18} />
            </button>
          </div>
        </div>

        <div className="card">
          <p className="muted text-xs">Bugünkü odak</p>
          <p className="mb-4 text-3xl font-bold">{fmtMinutes(todayMin)}</p>
          <p className="mb-2 text-sm font-semibold">Oturumlar</p>
          {(sessions.data ?? []).length === 0 && <p className="muted text-sm">Henüz oturum yok.</p>}
          <ul className="space-y-2">
            {(sessions.data ?? []).map((s) => (
              <li key={s.id} className="flex items-center justify-between text-sm">
                <span className="min-w-0 truncate">{s.task_title ?? "Serbest odak"}</span>
                <span className="muted shrink-0 text-xs">
                  {fmtTime(s.started_at)} · {s.minutes} dk
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function fmt(ms: number) {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
