"use client";

import { Flame, Trophy } from "lucide-react";
import { useEffect } from "react";
import { useApi } from "@/lib/client";
import type { Progress } from "@/lib/progress";
import { celebrate } from "./celebrate";
import { onChanged } from "./toast";

// Sayfadaki tüm rozetler aynı değeri paylaşır; kutlama yalnızca bir kez çıkar.
let shownLevel: number | null = null;

/** İlerlemeyi tüm sayfalarda güncel tutar; seviye atlanınca kutlar. */
export function useProgress() {
  const p = useApi<Progress>("/api/progress");
  useEffect(() => onChanged(p.reload));
  // Geçici bir hata (ör. sunucu yeniden başlarken) rozeti boş bırakmasın: kısa süre sonra tekrar dene.
  useEffect(() => {
    if (!p.error || p.data) return;
    const t = setTimeout(p.reload, 3000);
    return () => clearTimeout(t);
  }, [p.error, p.data, p.reload]);
  useEffect(() => {
    if (!p.data) return;
    if (shownLevel !== null && p.data.level > shownLevel) {
      celebrate(`Seviye atladın! Artık ${p.data.level}. seviye · ${p.data.levelTitle}`);
    }
    shownLevel = p.data.level;
  }, [p.data]);
  return p;
}

/** Kenar çubuğunda seviye, XP çubuğu ve seri; mobilde küçük hali. */
export default function ProgressBadge({ compact }: { compact?: boolean }) {
  const { data: p } = useProgress();
  if (!p) return compact ? null : <div className="skeleton h-[74px]" />;

  if (compact)
    return (
      <span className="flex items-center gap-2 rounded-xl px-2 text-sm font-bold" aria-label={`${p.streak} günlük seri, seviye ${p.level}`}>
        <span className={`flex items-center gap-0.5 ${p.activeToday ? "text-streak-600 dark:text-streak-500" : "muted"}`}>
          <Flame size={17} fill={p.activeToday ? "currentColor" : "none"} />
          {p.streak}
        </span>
        <span className="grid h-7 min-w-7 place-items-center rounded-lg bg-brand-600 px-1.5 text-xs text-white">{p.level}</span>
      </span>
    );

  const pct = Math.round((p.levelCurrent / p.levelNeeded) * 100);
  return (
    <div className="surface-2 rounded-2xl p-3">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-600 text-white shadow-sm shadow-brand-600/30">
          <Trophy size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-tight">Seviye {p.level}</p>
          <p className="muted truncate text-xs">{p.levelTitle}</p>
        </div>
        <span
          className={`flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-bold ${p.activeToday ? "bg-orange-100 text-streak-600 dark:bg-orange-500/15 dark:text-streak-500" : "muted"}`}
          title={p.activeToday ? "Bugün aktiftin, seri devam ediyor" : "Bugün bir iş bitir ya da odaklan, seri devam etsin"}
        >
          <Flame size={16} fill={p.activeToday ? "currentColor" : "none"} />
          {p.streak}
        </span>
      </div>
      <div className="mt-3">
        <div
          className="h-2 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Sonraki seviyeye ilerleme"
        >
          <div className="h-full rounded-full bg-success-600 transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
        <p className="muted mt-1 flex justify-between text-[11px] tabular-nums">
          <span>{p.levelCurrent} / {p.levelNeeded} XP</span>
          <span>bugün +{p.xpToday}</span>
        </p>
      </div>
    </div>
  );
}

/** Dairesel ilerleme halkası */
export function Ring({
  value,
  size = 120,
  stroke = 10,
  color = "var(--primary)",
  children,
  label,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: React.ReactNode;
  label: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-black/[0.06] dark:stroke-white/[0.08]" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{ transition: "stroke-dashoffset 600ms ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}
