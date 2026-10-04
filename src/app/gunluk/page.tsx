"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { addDays, api, fmtDate, parseYmd, useApi, ymd } from "@/lib/client";

const MOODS = [
  { v: 1, e: "😞", l: "Kötü" },
  { v: 2, e: "😕", l: "İdare eder" },
  { v: 3, e: "😐", l: "Normal" },
  { v: 4, e: "🙂", l: "İyi" },
  { v: 5, e: "😄", l: "Harika" },
];

type Entry = { date: string; content: string; mood: number | null };

export default function JournalPage() {
  const [date, setDate] = useState(ymd(new Date()));
  const [content, setContent] = useState("");
  const [mood, setMood] = useState<number | null>(null);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const recent = useApi<Entry[]>("/api/journal");
  const loaded = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    loaded.current = null;
    api<Entry>(`/api/journal?date=${date}`).then((e) => {
      setContent(e.content);
      setMood(e.mood);
      loaded.current = date;
      setSaved("idle");
    });
  }, [date]);

  const persist = (c: string, m: number | null) => {
    if (loaded.current !== date) return;
    setSaved("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await api("/api/journal", { method: "PUT", body: { date, content: c, mood: m } });
      setSaved("saved");
      recent.reload();
    }, 600);
  };

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-3">
      <section className="space-y-4 lg:col-span-2">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Günlük</h1>
            <p className="muted text-sm">{fmtDate(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
          </div>
          <div className="flex gap-1">
            <button className="btn-ghost p-2" onClick={() => setDate(ymd(addDays(parseYmd(date), -1)))} aria-label="Önceki gün">
              <ChevronLeft size={18} />
            </button>
            <button className="btn-ghost" onClick={() => setDate(ymd(new Date()))}>
              Bugün
            </button>
            <button className="btn-ghost p-2" onClick={() => setDate(ymd(addDays(parseYmd(date), 1)))} aria-label="Sonraki gün">
              <ChevronRight size={18} />
            </button>
          </div>
        </header>
        <div className="card space-y-4">
          <div>
            <span className="label">Bugün nasıl hissediyorsun?</span>
            <div className="flex gap-2">
              {MOODS.map((m) => (
                <button
                  key={m.v}
                  title={m.l}
                  onClick={() => {
                    const v = mood === m.v ? null : m.v;
                    setMood(v);
                    persist(content, v);
                  }}
                  className={`grid h-11 w-11 place-items-center rounded-xl text-2xl transition ${mood === m.v ? "scale-110 bg-brand-100 ring-2 ring-brand-500 dark:bg-brand-500/20" : "opacity-60 hover:opacity-100"}`}
                >
                  {m.e}
                </button>
              ))}
            </div>
          </div>
          <textarea
            className="input min-h-[45vh] resize-y text-base leading-relaxed"
            placeholder="Bugün neler oldu? Neye minnettarsın? Yarın için ne planlıyorsun?"
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              persist(e.target.value, mood);
            }}
          />
          <p className="muted text-right text-xs">{saved === "saving" ? "Kaydediliyor…" : saved === "saved" ? "Kaydedildi ✓" : ""}</p>
        </div>
      </section>
      <aside className="card h-fit">
        <h2 className="mb-3 font-semibold">Son kayıtlar</h2>
        {(recent.data ?? []).length === 0 && <p className="muted text-sm">Henüz kayıt yok.</p>}
        <ul className="space-y-1">
          {(recent.data ?? []).map((e) => (
            <li key={e.date}>
              <button
                onClick={() => setDate(e.date)}
                className={`w-full rounded-lg p-2 text-left transition hover:bg-black/5 dark:hover:bg-white/5 ${e.date === date ? "bg-brand-50 dark:bg-brand-500/10" : ""}`}
              >
                <p className="text-sm font-medium">
                  {e.mood ? MOODS[e.mood - 1].e : "📝"} {fmtDate(e.date, { day: "numeric", month: "long", weekday: "short" })}
                </p>
                <p className="muted line-clamp-2 text-xs">{e.content || "—"}</p>
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
