"use client";

import { Archive, Check, Flame, Pencil, Plus, Sprout, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { onChanged, toast } from "@/components/toast";
import { addDays, api, useApi, WEEKDAYS_SHORT, ymd } from "@/lib/client";
import type { Habit } from "@/lib/types";

const ICONS = ["✅", "💧", "🏃", "📚", "🧘", "💪", "🥗", "😴", "✍️", "🎸", "🧠", "🚭", "🌅", "💊", "🧹", "💰"];
const COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#06b6d4", "#ef4444", "#8b5cf6", "#64748b"];
const WEEKS = 16;

export default function HabitsPage() {
  const habits = useApi<Habit[]>("/api/habits");
  const [editing, setEditing] = useState<Partial<Habit> | null>(null);
  useEffect(() => onChanged(habits.reload));

  const today = new Date();
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));

  const setCount = async (h: Habit, date: string, count: number) => {
    // İyimser güncelleme
    habits.setData((list) => list?.map((x) => (x.id === h.id ? { ...x, logs: { ...x.logs, [date]: count } } : x)));
    try {
      await api(`/api/habits/${h.id}`, { body: { date, count } });
      habits.reload();
    } catch (e) {
      toast((e as Error).message, "error");
      habits.reload();
    }
  };

  const cycle = (h: Habit, date: string) => {
    const c = h.logs[date] ?? 0;
    setCount(h, date, c >= h.target ? 0 : c + 1);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Alışkanlıklar</h1>
          <p className="muted text-sm">Rutinlerini takip et, serini koru.</p>
        </div>
        <button className="btn-primary" onClick={() => setEditing({ icon: "✅", color: COLORS[0], days: "0123456", target: 1 })}>
          <Plus size={16} /> Yeni alışkanlık
        </button>
      </header>

      {habits.data?.length === 0 && (
        <div className="card py-12 text-center">
          <Sprout size={32} className="mx-auto text-success-600" aria-hidden />
          <p className="muted mt-2 text-sm">Henüz alışkanlık yok. Su içmek, spor, okuma gibi bir rutinle başla.</p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {(habits.data ?? []).map((h) => {
          const created = ymd(new Date(h.created_at));
          let planned = 0;
          let hit = 0;
          for (let i = 0; i < 30; i++) {
            const d = addDays(today, -i);
            const k = ymd(d);
            if (k < created || !h.days.includes(String(d.getDay()))) continue;
            planned++;
            if ((h.logs[k] ?? 0) >= h.target) hit++;
          }
          const rate = planned ? Math.round((hit / planned) * 100) : 0;
          return (
            <div key={h.id} className="card space-y-4">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-xl text-2xl" style={{ background: `${h.color}22` }}>
                  {h.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{h.name}</p>
                  <p className="muted text-xs">
                    {h.days.length === 7 ? "Her gün" : h.days.split("").map((d) => WEEKDAYS_SHORT[Number(d)]).join(", ")}
                    {h.target > 1 && ` · günde ${h.target} kez`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="flex items-center justify-end gap-1 text-lg font-bold text-streak-600 dark:text-streak-500" aria-label={`${h.streak} günlük seri`}><Flame size={18} fill="currentColor" aria-hidden /> {h.streak}</p>
                  <p className="muted text-xs">%{rate} · 30 gün</p>
                </div>
                <button className="btn-ghost border-0 p-1.5" onClick={() => setEditing(h)} aria-label="Düzenle">
                  <Pencil size={16} />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1.5">
                {last7.map((d) => {
                  const k = ymd(d);
                  const c = h.logs[k] ?? 0;
                  const active = h.days.includes(String(d.getDay()));
                  const ok = c >= h.target;
                  return (
                    <button
                      key={k}
                      onClick={() => cycle(h, k)}
                      className={`flex flex-col items-center gap-1 rounded-lg py-1.5 text-xs transition hover:bg-black/5 dark:hover:bg-white/5 ${active ? "" : "opacity-40"}`}
                    >
                      <span className="muted">{WEEKDAYS_SHORT[d.getDay()]}</span>
                      <span
                        className="grid h-8 w-8 place-items-center rounded-full border-2 text-[11px] font-semibold"
                        style={{
                          borderColor: h.color,
                          background: ok ? h.color : c > 0 ? `${h.color}55` : undefined,
                          color: ok ? "#fff" : undefined,
                        }}
                      >
                        {ok ? <Check size={14} strokeWidth={3} /> : c > 0 ? `${c}/${h.target}` : d.getDate()}
                      </span>
                    </button>
                  );
                })}
              </div>

              <Heatmap habit={h} />
            </div>
          );
        })}
      </div>

      <HabitEditor habit={editing} onClose={() => setEditing(null)} onSaved={habits.reload} />
    </div>
  );
}

function Heatmap({ habit }: { habit: Habit }) {
  const today = new Date();
  // Haftanın başlangıcı Pazartesi olacak şekilde hizala
  const end = addDays(today, (7 - ((today.getDay() + 6) % 7) - 1) % 7);
  const start = addDays(end, -(WEEKS * 7 - 1));
  const cols = Array.from({ length: WEEKS }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
  return (
    <div className="overflow-x-auto">
      <div className="flex gap-[3px]">
        {cols.map((col, i) => (
          <div key={i} className="flex flex-col gap-[3px]">
            {col.map((d) => {
              const k = ymd(d);
              const c = habit.logs[k] ?? 0;
              const future = d > today;
              const ratio = Math.min(1, c / habit.target);
              return (
                <div
                  key={k}
                  title={`${d.toLocaleDateString("tr-TR")}: ${c}/${habit.target}`}
                  className="h-3 w-3 rounded-[3px] bg-black/[0.06] dark:bg-white/[0.08]"
                  style={!future && c > 0 ? { background: habit.color, opacity: 0.35 + ratio * 0.65 } : future ? { opacity: 0.3 } : undefined}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function HabitEditor({ habit, onClose, onSaved }: { habit: Partial<Habit> | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Partial<Habit>>({});
  useEffect(() => {
    if (habit) setF(habit);
  }, [habit]);
  if (!habit) return null;
  const set = (p: Partial<Habit>) => setF((x) => ({ ...x, ...p }));
  const days = f.days ?? "0123456";
  const toggleDay = (d: number) => {
    const s = String(d);
    const next = days.includes(s) ? days.replace(s, "") : [...days, s].sort().join("");
    if (next) set({ days: next });
  };

  const save = async () => {
    if (!f.name?.trim()) return toast("İsim girin", "error");
    const body = { name: f.name, icon: f.icon, color: f.color, days, target: f.target };
    if (habit.id) await api(`/api/habits/${habit.id}`, { method: "PATCH", body });
    else await api("/api/habits", { body });
    onSaved();
    onClose();
  };

  const archive = async () => {
    await api(`/api/habits/${habit.id}`, { method: "PATCH", body: { archived: 1 } });
    toast("Arşivlendi");
    onSaved();
    onClose();
  };

  const remove = async () => {
    if (!confirm("Alışkanlık ve tüm kayıtları silinsin mi?")) return;
    await api(`/api/habits/${habit.id}`, { method: "DELETE" });
    onSaved();
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={habit.id ? "Alışkanlığı düzenle" : "Yeni alışkanlık"}>
      <div className="space-y-4">
        <input
          autoFocus
          className="input text-base"
          placeholder="ör. 2 litre su iç"
          value={f.name ?? ""}
          onChange={(e) => set({ name: e.target.value })}
        />
        <div>
          <span className="label">Simge</span>
          <div className="flex flex-wrap gap-1.5">
            {ICONS.map((i) => (
              <button
                key={i}
                onClick={() => set({ icon: i })}
                className={`grid h-9 w-9 place-items-center rounded-lg text-lg ${f.icon === i ? "bg-brand-100 ring-2 ring-brand-500 dark:bg-brand-500/20" : "hover:bg-black/5 dark:hover:bg-white/5"}`}
              >
                {i}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="label">Renk</span>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => set({ color: c })}
                className={`h-7 w-7 rounded-full ring-offset-2 ${f.color === c ? "ring-2 ring-brand-500" : ""}`}
                style={{ background: c }}
                aria-label={c}
              />
            ))}
          </div>
        </div>
        <div>
          <span className="label">Günler</span>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <button
                key={d}
                onClick={() => toggleDay(d)}
                className={`flex-1 rounded-lg py-2 text-xs font-medium ${days.includes(String(d)) ? "bg-brand-600 text-white" : "border border-theme"}`}
              >
                {WEEKDAYS_SHORT[d]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="label">Günlük hedef (kaç kez)</span>
          <input
            type="number"
            min={1}
            className="input w-28"
            value={f.target ?? 1}
            onChange={(e) => set({ target: Number(e.target.value) })}
          />
        </div>
        <div className="flex flex-wrap justify-between gap-2 pt-2">
          <div className="flex gap-1">
            {habit.id && (
              <>
                <button className="btn-danger" onClick={remove}>
                  <Trash2 size={16} /> Sil
                </button>
                <button className="btn-ghost border-0" onClick={archive}>
                  <Archive size={16} /> Arşivle
                </button>
              </>
            )}
          </div>
          <button className="btn-primary" onClick={save}>
            Kaydet
          </button>
        </div>
      </div>
    </Modal>
  );
}
