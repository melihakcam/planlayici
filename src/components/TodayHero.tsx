"use client";

import { CalendarPlus, Play, Star, Sunrise, Target, Timer } from "lucide-react";
import Link from "next/link";
import { fmtMinutes, fmtTime } from "@/lib/client";
import type { Progress } from "@/lib/progress";
import type { EventRow, Task } from "@/lib/types";
import { Ring } from "./Ring";

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

  // Tek birincil eylem: durumuna göre değişir
  let cta: { href: string; label: string; icon: typeof Play };
  let line: string;
  if (!planned && hour < 20) {
    cta = { href: "/planla", label: "Günü planla", icon: Sunrise };
    line = "Günü 5 dakikada planla; gerisini ben takip edeyim.";
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
    <section className="hero-gradient glow animate-rise relative overflow-hidden rounded-3xl text-white">
      {/* yumuşak ışık lekeleri */}
      <span className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/20 blur-3xl" aria-hidden />
      <span className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-fuchsia-300/30 blur-3xl" aria-hidden />
      <div className="relative grid gap-5 p-5 md:grid-cols-[auto_1fr] md:p-7 lg:grid-cols-[auto_1fr_auto]">
        <Ring value={score} size={132} stroke={12} color="#ffffff" track="rgb(255 255 255 / 0.25)" label={`Günlük hedefin yüzde ${Math.round(score * 100)} tamamlandı`}>
          <span className="text-3xl font-extrabold tabular-nums tracking-tight">{Math.round(score * 100)}%</span>
          <span className="text-[11px] font-medium text-white/80">günlük hedef</span>
        </Ring>

        <div className="flex min-w-0 flex-col justify-center gap-3">
          <div>
            <p className="text-sm font-medium text-white/80">
              {new Date(now).toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" })}
            </p>
            <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">{greeting(hour)}</h1>
            <p className="mt-1 text-[15px] text-white/95">{line}</p>
            {next && (
              <p className="mt-1 text-sm text-white/80">
                Sıradaki: <span className="font-semibold text-white">{next.title}</span> · {fmtTime(next.start)} (
                {fmtMinutes(Math.round((next.start_ms - now) / 60_000))} sonra)
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={cta.href} className="btn cta-pulse bg-white px-5 text-[15px] text-violet-700 shadow-lg hover:bg-white/90">
              <CtaIcon size={18} /> {cta.label}
            </Link>
            <button className="btn border border-white/40 text-white hover:bg-white/15" onClick={onNewEvent}>
              <CalendarPlus size={16} /> Etkinlik
            </button>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:col-span-2 lg:col-span-1 lg:w-56 lg:grid-cols-1">
          <Mini
            icon={<Timer size={16} />}
            tone=""
            label="Odak"
            value={`${p?.focusMinutes ?? 0}/${p?.focusGoal ?? 120} dk`}
          />
          <Mini icon={<Star size={16} />} tone="" label="En önemli" value={`${p?.topDone ?? 0}/${p?.topTotal ?? 0}`} />
          <Mini icon={<Target size={16} />} tone="" label="Boş zaman" value={fmtMinutes(freeMin)} />
        </dl>
      </div>
    </section>
  );
}

function Mini({ icon, tone, label, value }: { icon: React.ReactNode; tone: string; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/15 px-3 py-2 ring-1 ring-white/25 backdrop-blur-md">
      <dt className={`flex items-center gap-1.5 text-xs font-semibold text-white/85 ${tone}`}>
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 text-base font-bold tabular-nums">{value}</dd>
    </div>
  );
}
