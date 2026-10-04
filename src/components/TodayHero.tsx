"use client";

import { CalendarPlus, Flame, Moon, Play, Star, Sunrise, Target, Timer } from "lucide-react";
import Link from "next/link";
import { fmtMinutes, fmtTime } from "@/lib/client";
import type { Progress } from "@/lib/progress";
import type { EventRow, Task } from "@/lib/types";
import { Ring } from "./ProgressBadge";

function greeting(h: number) {
  if (h < 6) return "İyi geceler";
  if (h < 12) return "Günaydın";
  if (h < 18) return "İyi günler";
  return "İyi akşamlar";
}

/**
 * Bugün sayfasının üst alanı: günlük hedef halkası, durumuna göre tek bir ana eylem
 * (planla → odaklan → kapat) ve seri/odak/en önemli işler özetleri.
 */
export default function TodayHero({
  events,
  tasks,
  progress,
  planned,
  freeMin,
  now,
  onNewEvent,
}: {
  events: EventRow[];
  tasks: Task[];
  progress?: Progress;
  planned: boolean;
  freeMin: number;
  now: number;
  onNewEvent: () => void;
}) {
  const hour = new Date(now).getHours();
  const timed = events.filter((e) => !e.all_day).sort((a, b) => a.start_ms - b.start_ms);
  const current = timed.find((e) => e.start_ms <= now && e.end_ms > now);
  const next = timed.find((e) => e.start_ms > now);
  const today = new Date(now).toLocaleDateString("sv-SE");
  const tops = tasks.filter((t) => t.top_date === today && !t.parent_id);
  const nextTop = tops.find((t) => t.status === "todo");
  const currentTask = current?.task_id ? tasks.find((t) => t.id === current.task_id && t.status === "todo") : undefined;
  const p = progress?.today;
  const closed = Boolean(p?.closed);

  // Tek birincil eylem: durumuna göre değişir
  let cta: { href: string; label: string; icon: typeof Play };
  let line: string;
  if (!planned && hour < 20) {
    cta = { href: "/planla", label: "Günü planla", icon: Sunrise };
    line = "Günü 5 dakikada planla; gerisini ben takip edeyim.";
  } else if (hour >= 20 && !closed) {
    cta = { href: "/kapanis", label: "Günü kapat", icon: Moon };
    line = "Günü kapatmadan önce yapılanları işaretle, kalanlara karar ver.";
  } else if (currentTask) {
    cta = { href: `/odak?task=${currentTask.id}`, label: "Odaklanmaya başla", icon: Play };
    line = `Şu an: ${currentTask.title} · bitişe ${fmtMinutes(Math.max(1, Math.round((current!.end_ms - now) / 60_000)))}`;
  } else if (nextTop) {
    cta = { href: `/odak?task=${nextTop.id}`, label: "Sıradaki işe odaklan", icon: Play };
    line = `Önerim: "${nextTop.title}" ile başla.`;
  } else if (tops.length && tops.every((t) => t.status === "done")) {
    cta = { href: "/odak", label: "Serbest odak", icon: Timer };
    line = "Günün en önemli işleri bitti. Harika gidiyorsun!";
  } else {
    cta = { href: "/odak", label: "Odaklanmaya başla", icon: Play };
    line = current ? `Şu an: ${current.title} · ${fmtTime(current.start)}–${fmtTime(current.end)}` : "Şu an boş zamandasın.";
  }
  const CtaIcon = cta.icon;
  const score = p?.score ?? 0;

  return (
    <section className="card animate-rise overflow-hidden p-0">
      <div className="grid gap-5 p-5 md:grid-cols-[auto_1fr] md:p-6 lg:grid-cols-[auto_1fr_auto]">
        <Ring value={score} size={132} stroke={12} label={`Günlük hedefin yüzde ${Math.round(score * 100)} tamamlandı`}>
          <span className="text-3xl font-extrabold tabular-nums tracking-tight">{Math.round(score * 100)}%</span>
          <span className="muted text-[11px] font-medium">günlük hedef</span>
        </Ring>

        <div className="flex min-w-0 flex-col justify-center gap-3">
          <div>
            <p className="muted text-sm font-medium">
              {new Date(now).toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" })}
            </p>
            <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">{greeting(hour)}</h1>
            <p className="mt-1 text-[15px]">{line}</p>
            {next && (
              <p className="muted mt-1 text-sm">
                Sıradaki: <span className="font-semibold text-[var(--text)]">{next.title}</span> · {fmtTime(next.start)} (
                {fmtMinutes(Math.round((next.start_ms - now) / 60_000))} sonra)
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={cta.href} className="btn-primary px-5 text-[15px]">
              <CtaIcon size={18} /> {cta.label}
            </Link>
            <button className="btn-ghost" onClick={onNewEvent}>
              <CalendarPlus size={16} /> Etkinlik
            </button>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:col-span-2 lg:col-span-1 lg:w-56 lg:grid-cols-2">
          <Mini
            icon={<Flame size={16} fill={progress?.activeToday ? "currentColor" : "none"} />}
            tone="text-streak-600 dark:text-streak-500"
            label="Seri"
            value={`${progress?.streak ?? 0} gün`}
          />
          <Mini
            icon={<Timer size={16} />}
            tone="text-success-600 dark:text-success-500"
            label="Odak"
            value={`${p?.focusMinutes ?? 0}/${p?.focusGoal ?? 120} dk`}
          />
          <Mini icon={<Star size={16} />} tone="text-streak-600 dark:text-streak-500" label="En önemli" value={`${p?.topDone ?? 0}/${p?.topTotal ?? 0}`} />
          <Mini icon={<Target size={16} />} tone="text-brand-600 dark:text-brand-500" label="Boş zaman" value={fmtMinutes(freeMin)} />
        </dl>
      </div>
    </section>
  );
}

function Mini({ icon, tone, label, value }: { icon: React.ReactNode; tone: string; label: string; value: string }) {
  return (
    <div className="surface-2 rounded-xl px-3 py-2">
      <dt className={`flex items-center gap-1.5 text-xs font-semibold ${tone}`}>
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 text-base font-bold tabular-nums">{value}</dd>
    </div>
  );
}
