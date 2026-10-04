"use client";

import { Pause, Play, RotateCcw, SkipForward, Sprout } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { celebrate, xpToast } from "@/components/celebrate";
import { emitChanged, toast } from "@/components/toast";
import { api, fmtMinutes, fmtTime, useApi } from "@/lib/client";
import type { Task } from "@/lib/types";

type Mode = "focus" | "short" | "long";
type State = {
  mode: Mode;
  endAt: number | null;
  remaining: number;
  taskId: string;
  cycles: number;
  startedAt: string | null;
  /** Son odak yarıda bırakıldıysa fidan solmuş görünür (yeni başlangıçta düzelir) */
  wilted?: boolean;
};
type Session = { id: string; minutes: number; started_at: string; task_title: string | null; abandoned: number };

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
  const settings = useApi<{ pomodoroFocus: number; pomodoroBreak: number; pomodoroLong: number; dailyFocusGoal: number }>("/api/settings");
  const tasks = useApi<Task[]>("/api/tasks");
  const sessions = useApi<Session[]>("/api/focus?days=1");
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

  // Durumu geri yükle; ?task=… ile gelindiyse o görevi seç
  useEffect(() => {
    if (!settings.data || st) return;
    let saved: State | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(KEY) || "null");
    } catch {}
    const base: State = saved ?? { mode: "focus", endAt: null, remaining: durations("focus"), taskId: "", cycles: 0, startedAt: null };
    const fromUrl = new URLSearchParams(window.location.search).get("task");
    if (fromUrl && !base.endAt) {
      base.taskId = fromUrl;
      window.history.replaceState(null, "", "/odak");
    }
    setSt(base);
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
  const elapsedMin = st ? Math.round((durations(st.mode) - left) / 60_000) : 0;

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
      emitChanged();
      if ("Notification" in window && Notification.permission === "granted") new Notification("Fidanın büyüdü", { body: "Odak süresi bitti, biraz mola ver." });
      if (remainingNow > 0) xpToast(minutes, `${minutes} dk odak`);
      else celebrate(`Fidanın çiçek açtı! ${minutes} dk odak · +${minutes} XP`);
    } else if (st.mode === "focus") {
      toast("1 dakikadan kısa oturumlar kaydedilmez.");
    } else {
      if ("Notification" in window && Notification.permission === "granted") new Notification("Mola bitti", { body: "Yeni bir fidan dikme zamanı." });
      toast("Mola bitti, yeni bir fidan dikelim!");
    }
    const next: Mode = st.mode === "focus" ? (cycles % 4 === 0 ? "long" : "short") : "focus";
    setSt({ ...st, mode: next, endAt: null, remaining: durations(next), cycles, startedAt: null, wilted: false });
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

  if (!st)
    return (
      <div className="mx-auto max-w-4xl space-y-4" aria-busy="true">
        <div className="skeleton h-8 w-40" />
        <div className="skeleton h-[480px]" />
      </div>
    );

  const total = durations(st.mode);
  const progress = 1 - left / total;
  const running = Boolean(st.endAt);
  const inProgress = st.mode === "focus" && progress > 0 && progress < 1;
  const todo = (tasks.data ?? []).filter((t) => t.status === "todo");
  const done = (sessions.data ?? []).filter((s) => !s.abandoned);
  const todayMin = done.reduce((a, s) => a + s.minutes, 0);
  const goal = settings.data?.dailyFocusGoal ?? 120;
  const currentTask = todo.find((t) => t.id === st.taskId);

  /** Odak yarıda bırakılırsa fidan solar (1 dakikadan uzunsa kaydedilir). */
  const abandon = async () => {
    if (st.mode !== "focus" || elapsedMin < 1) return;
    await api("/api/focus", { body: { taskId: st.taskId || null, minutes: elapsedMin, startedAt: st.startedAt, abandoned: true } }).catch(() => {});
    sessions.reload();
    toast(`Fidan soldu. ${elapsedMin} dakikalık odak yarıda kaldı; bir dahakine sonuna kadar götürelim.`);
  };

  const start = () =>
    setSt({ ...st, endAt: Date.now() + st.remaining, startedAt: st.startedAt ?? new Date().toISOString(), wilted: false });
  const pause = () => setSt({ ...st, endAt: null, remaining: left });
  const reset = async () => {
    const wilted = inProgress && elapsedMin >= 1;
    if (wilted) await abandon();
    setSt({ ...st, endAt: null, remaining: durations(st.mode), startedAt: null, wilted });
  };
  const switchMode = async (m: Mode) => {
    if (m === st.mode) return;
    const wilted = inProgress && elapsedMin >= 1;
    if (wilted) await abandon();
    setSt({ ...st, mode: m, endAt: null, remaining: durations(m), startedAt: null, wilted });
  };

  const R = 128;
  const C = 2 * Math.PI * R;
  const ringColor = st.mode === "focus" ? "var(--success)" : "var(--primary)";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight">Odak</h1>
        <p className="muted text-sm">Odaklandıkça fidanın büyür; yarıda bırakırsan solar.</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card flex flex-col items-center gap-5 py-8 lg:col-span-2">
          <div className="surface-2 flex gap-1 rounded-xl p-1" role="tablist" aria-label="Zamanlayıcı türü">
            {(["focus", "short", "long"] as Mode[]).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={st.mode === m}
                onClick={() => switchMode(m)}
                className={`min-h-10 rounded-lg px-4 text-sm font-semibold transition ${st.mode === m ? "panel shadow-sm" : "muted"}`}
              >
                {LABEL[m]}
              </button>
            ))}
          </div>

          <div className="relative" style={{ width: 2 * R + 24, height: 2 * R + 24 }}>
            <svg width={2 * R + 24} height={2 * R + 24} className="-rotate-90" aria-hidden>
              <circle cx={R + 12} cy={R + 12} r={R} fill="none" strokeWidth={10} className="stroke-black/[0.06] dark:stroke-white/[0.08]" />
              <circle
                cx={R + 12}
                cy={R + 12}
                r={R}
                fill="none"
                stroke={ringColor}
                strokeWidth={10}
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - progress)}
                style={{ transition: "stroke-dashoffset .25s linear" }}
              />
            </svg>
            <div className="absolute inset-0 grid place-items-center">
              {st.mode === "focus" ? (
                <Plant growth={st.wilted ? 0.6 : progress} wilted={Boolean(st.wilted)} />
              ) : (
                <div className="text-center">
                  <p className="text-sm font-semibold text-brand-600 dark:text-brand-500">{LABEL[st.mode]}</p>
                  <p className="muted text-xs">Kalk, su iç, gözlerini dinlendir.</p>
                </div>
              )}
            </div>
          </div>

          <div className="text-center">
            <p className="text-6xl font-extrabold tabular-nums tracking-tight" aria-live="off">
              {fmt(left)}
            </p>
            <p className="muted mt-1 text-sm">
              {LABEL[st.mode]} · {st.cycles + (st.mode === "focus" ? 1 : 0)}. oturum
              {currentTask && st.mode === "focus" && (
                <>
                  {" "}· <span className="font-semibold text-[var(--text)]">{currentTask.title}</span>
                </>
              )}
            </p>
          </div>

          <label className="w-full max-w-sm">
            <span className="label text-center">Ne üzerinde çalışıyorsun?</span>
            <select className="input" value={st.taskId} onChange={(e) => setSt({ ...st, taskId: e.target.value })}>
              <option value="">Serbest odak (görev seçmeden)</option>
              {todo.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center gap-3">
            <button className="btn-ghost h-12 w-12 rounded-full p-0" onClick={reset} aria-label="Sıfırla (yarıda bırakırsan fidan solar)" title="Sıfırla">
              <RotateCcw size={18} />
            </button>
            {running ? (
              <button className="btn-ghost h-14 min-w-44 rounded-2xl px-8 text-base" onClick={pause}>
                <Pause size={20} /> Duraklat
              </button>
            ) : (
              <button className={`${st.mode === "focus" ? "btn-success" : "btn-primary"} h-14 min-w-44 rounded-2xl px-8 text-base`} onClick={start}>
                <Play size={20} /> {progress > 0 ? "Devam et" : st.mode === "focus" ? "Fidan dik ve başla" : "Molayı başlat"}
              </button>
            )}
            <button className="btn-ghost h-12 w-12 rounded-full p-0" onClick={finish} aria-label="Şimdi bitir" title="Şimdi bitir">
              <SkipForward size={18} />
            </button>
          </div>
        </section>

        <aside className="space-y-6">
          <section className="card">
            <p className="eyebrow muted">Bugünkü odak</p>
            <p className="mt-1 text-3xl font-extrabold tabular-nums">{fmtMinutes(todayMin)}</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]" role="progressbar" aria-valuenow={Math.round((todayMin / goal) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Günlük odak hedefi">
              <div className="h-full rounded-full bg-success-600 transition-[width] duration-500" style={{ width: `${Math.min(100, (todayMin / goal) * 100)}%` }} />
            </div>
            <p className="muted mt-1 text-xs">Hedef {fmtMinutes(goal)}</p>
          </section>

          <section className="card">
            <h2 className="mb-3 font-semibold">Bugünkü bahçen</h2>
            {(sessions.data ?? []).length === 0 ? (
              <p className="muted text-sm">Henüz fidan yok. İlk oturumla bahçeni kurmaya başla.</p>
            ) : (
              <div className="mb-4 flex flex-wrap gap-1.5" aria-label={`${done.length} fidan büyüdü, ${(sessions.data ?? []).length - done.length} fidan soldu`}>
                {(sessions.data ?? [])
                  .slice()
                  .reverse()
                  .map((s) => (
                    <span
                      key={s.id}
                      title={`${fmtTime(s.started_at)} · ${s.minutes} dk${s.abandoned ? " (yarıda kaldı)" : ""}`}
                      className={`grid h-9 w-9 place-items-center rounded-xl ${s.abandoned ? "surface-2 muted" : "bg-emerald-100 text-success-600 dark:bg-emerald-500/15 dark:text-success-500"}`}
                    >
                      <Sprout size={18} />
                    </span>
                  ))}
              </div>
            )}
            <ul className="space-y-2">
              {(sessions.data ?? []).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className={`min-w-0 truncate ${s.abandoned ? "muted line-through" : ""}`}>{s.task_title ?? "Serbest odak"}</span>
                  <span className="muted shrink-0 text-xs tabular-nums">
                    {fmtTime(s.started_at)} · {s.minutes} dk
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

/** Odak süresince büyüyen fidan: filiz → yapraklar → tomurcuk → çiçek. Solmuşsa gri ve eğik. */
function Plant({ growth, wilted }: { growth: number; wilted: boolean }) {
  const g = Math.max(0, Math.min(1, growth));
  const stemTop = 150 - 92 * Math.max(0.12, g);
  const leaf = wilted ? "var(--muted)" : "var(--success)";
  const leaves = [
    { at: 0.2, y: 132, side: -1 },
    { at: 0.35, y: 120, side: 1 },
    { at: 0.5, y: 104, side: -1 },
    { at: 0.65, y: 92, side: 1 },
  ];
  const label = wilted ? "Solmuş fidan" : g >= 1 ? "Çiçek açmış fidan" : `Fidan yüzde ${Math.round(g * 100)} büyüdü`;
  return (
    <svg width="170" height="170" viewBox="0 0 170 190" role="img" aria-label={label} style={{ transform: wilted ? "rotate(-8deg)" : undefined, transition: "transform 400ms ease-out" }}>
      {/* saksı */}
      <path d="M52 150h66l-8 34H60z" fill={wilted ? "var(--panel-2)" : "#c2410c"} opacity={wilted ? 1 : 0.85} />
      <rect x="46" y="144" width="78" height="10" rx="4" fill={wilted ? "var(--border)" : "#9a3412"} />
      {/* gövde */}
      <path d={`M85 148 Q${wilted ? 96 : 85} ${(148 + stemTop) / 2} 85 ${stemTop}`} stroke={leaf} strokeWidth="5" strokeLinecap="round" fill="none" />
      {/* yapraklar */}
      {leaves.map((l) =>
        g >= l.at ? (
          <ellipse
            key={l.at}
            cx={85 + l.side * 16}
            cy={l.y}
            rx="15"
            ry="7"
            fill={leaf}
            opacity={wilted ? 0.6 : 0.9}
            transform={`rotate(${l.side * (wilted ? 45 : -28)} ${85 + l.side * 16} ${l.y})`}
            className="animate-pop"
          />
        ) : null,
      )}
      {/* tomurcuk / çiçek */}
      {!wilted && g >= 0.85 && g < 1 && <circle cx="85" cy={stemTop} r="7" fill="var(--streak)" className="animate-pop" />}
      {!wilted && g >= 1 && (
        <g className="animate-pop">
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse key={a} cx="85" cy={stemTop - 12} rx="7" ry="12" fill="#f59e0b" transform={`rotate(${a} 85 ${stemTop})`} />
          ))}
          <circle cx="85" cy={stemTop} r="7" fill="var(--streak)" />
        </g>
      )}
      {g < 0.2 && !wilted && <circle cx="85" cy={stemTop} r="4" fill={leaf} />}
    </svg>
  );
}

function fmt(ms: number) {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
