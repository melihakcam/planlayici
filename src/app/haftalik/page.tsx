"use client";

import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import AreaIcon from "@/components/AreaIcon";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { emitChanged, toast } from "@/components/toast";
import { api, fmtDate, fmtMinutes, relDay, useApi } from "@/lib/client";
import type { ProjectStats } from "@/lib/types";

type Week = {
  start: string;
  end: string;
  days: { date: string; tasks: number; focus: number; busyHours: number; taskHours: number }[];
  done: { id: string; title: string; project_id: string | null }[];
  open: { id: string; title: string; due: string; project_id: string | null }[];
  projects: ProjectStats[];
  habitRate: number | null;
  moodAvg: number | null;
  focusTotal: number;
  note: string;
};

const MOOD = ["", "😞", "😕", "😐", "🙂", "😄"];

export default function WeekPage() {
  const [offset, setOffset] = useState(0);
  const week = useApi<Week>(`/api/week?offset=${offset}`);
  const [note, setNote] = useState("");
  const [planning, setPlanning] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const w = week.data;

  useEffect(() => {
    if (w) setNote(w.note);
  }, [w]);

  const saveNote = (v: string) => {
    setNote(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => api("/api/week", { method: "PUT", body: { offset, note: v } }), 700);
  };

  const planWeek = async () => {
    setPlanning(true);
    try {
      const r = await api<{ planned: unknown[]; unplanned: unknown[] }>("/api/schedule", { body: { days: 7 } });
      toast(`${r.planned.length} iş bu haftaya yerleştirildi${r.unplanned.length ? `, ${r.unplanned.length} iş sığmadı` : ""}`, "success");
      emitChanged();
      week.reload();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setPlanning(false);
    }
  };

  const maxH = Math.max(1, ...(w?.days ?? []).map((d) => d.busyHours + d.taskHours));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Haftalık</h1>
          <p className="muted text-sm">
            {w ? `${fmtDate(w.start, { day: "numeric", month: "long" })} – ${fmtDate(w.end, { day: "numeric", month: "long" })}` : "…"}
          </p>
        </div>
        <div className="flex gap-1">
          <button className="btn-ghost p-2" onClick={() => setOffset(offset - 1)} aria-label="Önceki hafta">
            <ChevronLeft size={18} />
          </button>
          <button className="btn-ghost" onClick={() => setOffset(0)} disabled={offset === 0}>
            Bu hafta
          </button>
          <button className="btn-ghost p-2" onClick={() => setOffset(offset + 1)} aria-label="Sonraki hafta">
            <ChevronRight size={18} />
          </button>
          {offset >= 0 && (
            <button className="btn-primary ml-2" onClick={planWeek} disabled={planning}>
              <Sparkles size={16} /> {planning ? "Planlanıyor…" : "Haftayı planla"}
            </button>
          )}
        </div>
      </header>

      {!w ? (
        <div className="space-y-3" aria-busy="true" aria-label="Yükleniyor"><div className="skeleton h-28" /><div className="skeleton h-28" /><div className="skeleton h-28" /></div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Tamamlanan iş" value={String(w.done.length)} />
            <Tile label="Odak süresi" value={fmtMinutes(w.focusTotal)} />
            <Tile label="Alışkanlık başarısı" value={w.habitRate == null ? "–" : `%${Math.round(w.habitRate * 100)}`} />
            <Tile label="Ruh hali" value={w.moodAvg == null ? "–" : `${MOOD[Math.round(w.moodAvg)]} ${w.moodAvg}`} />
          </section>

          <section className="card">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">Günlerin doluluğu</h2>
              <span className="muted flex items-center gap-3 text-xs">
                <span>
                  <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-brand-600" />
                  Görev blokları
                </span>
                <span>
                  <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-slate-400" />
                  Diğer etkinlikler
                </span>
              </span>
            </div>
            <div className="grid grid-cols-7 gap-2">
              {w.days.map((d) => (
                <div key={d.date} className="flex flex-col items-center gap-1" title={`${d.taskHours} sa görev, ${d.busyHours} sa etkinlik, ${d.tasks} iş tamamlandı`}>
                  <div className="flex h-28 w-full max-w-10 flex-col-reverse gap-[2px]">
                    <div className="rounded-b-[4px] bg-slate-400" style={{ height: `${(d.busyHours / maxH) * 100}%` }} />
                    <div className="rounded-t-[4px] bg-brand-600" style={{ height: `${(d.taskHours / maxH) * 100}%` }} />
                  </div>
                  <span className="text-xs font-medium">{fmtDate(d.date, { weekday: "short" })}</span>
                  <span className="muted text-[10px]">{d.tasks ? `✓ ${d.tasks}` : "·"}</span>
                </div>
              ))}
            </div>
          </section>

          {w.projects.length > 0 && (
            <section className="card space-y-3">
              <h2 className="font-semibold">Proje dengesi</h2>
              {w.projects.map((p) => {
                const total = p.week_done_h + p.week_planned_h;
                const status = p.weekly_hours === 0 ? null : total >= p.weekly_hours ? "ok" : p.week_done_h === 0 && total === 0 ? "warn" : null;
                return (
                  <div key={p.id} className="flex items-center gap-3 text-sm">
                    <span className="w-40 shrink-0 truncate">
                      <AreaIcon area={p.area} className="mr-1 inline" /> {p.name}
                    </span>
                    <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
                      <div style={{ width: `${Math.min(100, (p.week_done_h / Math.max(p.weekly_hours, total, 0.1)) * 100)}%`, background: p.color }} />
                      <div style={{ width: `${Math.min(100, (p.week_planned_h / Math.max(p.weekly_hours, total, 0.1)) * 100)}%`, background: p.color, opacity: 0.35 }} />
                    </div>
                    <span className="w-28 shrink-0 text-right text-xs tabular-nums">
                      {p.week_done_h}
                      {p.week_planned_h > 0 && <span className="muted">+{p.week_planned_h}</span>}
                      {p.weekly_hours > 0 && ` / ${p.weekly_hours}`} sa{" "}
                      {status === "ok" && <CheckCircle2 size={14} className="inline text-success-600" aria-label="Hedef tamam" />}
                      {status === "warn" && <AlertTriangle size={14} className="inline text-amber-600" aria-label="Bu hafta hiç zaman ayrılmadı" />}
                    </span>
                  </div>
                );
              })}
              <p className="muted text-xs">Koyu: yapılan · Açık: planlanan. Hedefini Projeler sayfasından belirle.</p>
            </section>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="card">
              <h2 className="mb-2 font-semibold">Bu hafta tamamlananlar ({w.done.length})</h2>
              {w.done.length === 0 && <p className="muted text-sm">Henüz yok.</p>}
              <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
                {w.done.map((t) => (
                  <li key={t.id}>✓ {t.title}</li>
                ))}
              </ul>
            </section>
            <section className="card">
              <h2 className="mb-2 font-semibold">Bu haftaya tarihli, bekleyenler ({w.open.length})</h2>
              {w.open.length === 0 && <p className="muted text-sm">Bekleyen yok</p>}
              <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
                {w.open.map((t) => (
                  <li key={t.id} className="flex justify-between gap-2">
                    <span className="truncate">{t.title}</span>
                    <span className="muted shrink-0 text-xs">{relDay(t.due)}</span>
                  </li>
                ))}
              </ul>
              {w.open.length > 0 && offset === 0 && (
                <Link href="/planla" className="mt-2 inline-block text-sm text-brand-600 hover:underline">
                  Sabah planında ele al →
                </Link>
              )}
            </section>
          </div>

          <section className="card">
            <h2 className="mb-2 font-semibold">Haftanın notu</h2>
            <textarea
              className="input min-h-28"
              placeholder={"Neler iyi gitti? Ne zorladı? Gelecek hafta neye odaklanacağım?"}
              value={note}
              onChange={(e) => saveNote(e.target.value)}
            />
          </section>
        </>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <p className="muted text-xs">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
    </div>
  );
}
