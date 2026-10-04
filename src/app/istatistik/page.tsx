"use client";

import { Flame } from "lucide-react";
import { useState } from "react";
import { fmtDate, fmtMinutes, useApi } from "@/lib/client";

type Day = { date: string; tasks: number; focus: number; eventHours: number; habits: number; habitsPlanned: number };
type Stats = {
  days: Day[];
  habits: { id: string; name: string; icon: string; color: string; streak: number; rate: number }[];
  totals: { tasks: number; focus: number; eventHours: number; open: number; overdue: number };
};

const RANGES = [7, 14, 30, 90];

export default function StatsPage() {
  const [days, setDays] = useState(14);
  const { data } = useApi<Stats>(`/api/stats?days=${days}`);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">İstatistik</h1>
        <div className="flex gap-1 rounded-xl bg-black/5 p-1 dark:bg-white/5">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setDays(r)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${days === r ? "panel shadow-sm" : "muted"}`}
            >
              {r} gün
            </button>
          ))}
        </div>
      </header>

      {!data ? (
        <div className="space-y-3" aria-busy="true" aria-label="Yükleniyor"><div className="skeleton h-28" /><div className="skeleton h-28" /><div className="skeleton h-28" /></div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Tamamlanan görev" value={String(data.totals.tasks)} sub={`${days} günde`} />
            <Tile label="Odak süresi" value={fmtMinutes(data.totals.focus)} sub={`günde ort. ${fmtMinutes(Math.round(data.totals.focus / days))}`} />
            <Tile label="Takvimdeki etkinlik" value={`${data.totals.eventHours} sa`} sub={`${days} günde`} />
            <Tile
              label="Açık görev"
              value={String(data.totals.open)}
              sub={data.totals.overdue ? `⚠ ${data.totals.overdue} gecikmiş` : "gecikmiş yok"}
            />
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <BarChart title="Günlük tamamlanan görev" days={data.days} value={(d) => d.tasks} format={(v) => `${v} görev`} />
            <BarChart title="Günlük odak süresi" days={data.days} value={(d) => d.focus} format={(v) => fmtMinutes(v)} />
            <BarChart
              title="Takvimde dolu saat"
              days={data.days}
              value={(d) => d.eventHours}
              format={(v) => `${v} sa`}
            />
            <BarChart
              title="Alışkanlık başarısı"
              days={data.days}
              value={(d) => (d.habitsPlanned ? Math.round((d.habits / d.habitsPlanned) * 100) : 0)}
              format={(v) => `%${v}`}
              max={100}
            />
          </div>

          <section className="card">
            <h2 className="mb-4 font-semibold">Alışkanlıklar · son {days} gün</h2>
            {data.habits.length === 0 && <p className="muted text-sm">Henüz alışkanlık yok.</p>}
            <div className="space-y-3">
              {data.habits.map((h) => (
                <div key={h.id} className="flex items-center gap-3">
                  <span className="w-6 text-center text-lg">{h.icon}</span>
                  <span className="w-40 truncate text-sm">{h.name}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
                    <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.round(h.rate * 100)}%` }} />
                  </div>
                  <span className="w-12 text-right text-sm tabular-nums">%{Math.round(h.rate * 100)}</span>
                  <span className="flex w-14 items-center justify-end gap-0.5 text-xs font-semibold text-streak-600 dark:text-streak-500" aria-label={`${h.streak} günlük seri`}><Flame size={12} fill="currentColor" aria-hidden /> {h.streak}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card">
      <p className="muted text-xs">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
      <p className="muted mt-0.5 text-xs">{sub}</p>
    </div>
  );
}

function BarChart({
  title,
  days,
  value,
  format,
  max,
}: {
  title: string;
  days: Day[];
  value: (d: Day) => number;
  format: (v: number) => string;
  max?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const vals = days.map(value);
  const top = max ?? Math.max(1, ...vals);
  const labelEvery = days.length > 30 ? 14 : days.length > 14 ? 5 : days.length > 7 ? 2 : 1;
  const h = hover ?? vals.length - 1;

  return (
    <section className="card">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        <p className="text-sm">
          <span className="font-semibold tabular-nums">{format(vals[h] ?? 0)}</span>{" "}
          <span className="muted text-xs">{fmtDate(days[h]?.date ?? "", { day: "numeric", month: "short" })}</span>
        </p>
      </div>
      <div className="relative h-40" onMouseLeave={() => setHover(null)}>
        {/* Kılavuz çizgileri */}
        {[0, 0.5, 1].map((g) => (
          <div key={g} className="absolute inset-x-0 border-t border-dashed border-theme" style={{ bottom: `${g * 100}%` }} />
        ))}
        <div className="absolute inset-0 flex items-end gap-[2px]">
          {vals.map((v, i) => (
            <div
              key={days[i].date}
              className="flex h-full flex-1 cursor-default items-end"
              onMouseEnter={() => setHover(i)}
              title={`${fmtDate(days[i].date, { day: "numeric", month: "long" })}: ${format(v)}`}
            >
              <div
                className={`mx-auto w-full max-w-6 rounded-t-[4px] transition-opacity ${hover !== null && hover !== i ? "opacity-40" : ""}`}
                style={{ height: `${(v / top) * 100}%`, minHeight: v > 0 ? 2 : 0, background: "linear-gradient(to top, #7c3aed, #db2777)" }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="muted mt-1 flex gap-[2px] text-[10px]">
        {days.map((d, i) => (
          <span key={d.date} className="flex-1 text-center">
            {(days.length - 1 - i) % labelEvery === 0 ? fmtDate(d.date, { day: "numeric", month: days.length > 14 ? "short" : undefined }) : ""}
          </span>
        ))}
      </div>
    </section>
  );
}
