"use client";

import {
  BarChart3,
  BookOpen,
  CalendarDays,
  CalendarRange,
  CheckSquare,
  Flame,
  FolderKanban,
  LayoutDashboard,
  Moon,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Settings,
  Sun,
  Sunrise,
  Timer,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, useApi } from "@/lib/client";
import type { EventRow, ProjectStats } from "@/lib/types";
import Modal from "./Modal";
import QuickAdd from "./QuickAdd";
import { emitChanged, toast, type ToastKind } from "./toast";

const NAV = [
  { href: "/", label: "Bugün", icon: LayoutDashboard },
  { href: "/takvim", label: "Takvim", icon: CalendarDays },
  { href: "/gorevler", label: "Görevler", icon: CheckSquare },
  { href: "/projeler", label: "Projeler", icon: FolderKanban },
  { href: "/planla", label: "Günü planla", icon: Sunrise },
  { href: "/haftalik", label: "Haftalık", icon: CalendarRange },
  { href: "/aliskanliklar", label: "Alışkanlıklar", icon: Flame },
  { href: "/odak", label: "Odak", icon: Timer },
  { href: "/gunluk", label: "Günlük", icon: BookOpen },
  { href: "/istatistik", label: "İstatistik", icon: BarChart3 },
  { href: "/ayarlar", label: "Ayarlar", icon: Settings },
];

type GoogleStatus = { connected: boolean; email: string | null; lastSync: string | null; lastError: string | null };

const SYNC_EVERY_MS = 5 * 60_000;
const MOBILE_MAIN = 4;

export default function AppShell({ children }: { children: React.ReactNode }) {
  // Giriş sayfasında menü, senkron ve bildirimler çalışmaz.
  if (usePathname() === "/giris") return <main className="px-4">{children}</main>;
  return <Shell>{children}</Shell>;
}

function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [dark, setDark] = useState(false);
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; message: string; kind: ToastKind }[]>([]);
  const notified = useRef(new Set<string>());
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => setMoreOpen(false), [path]);

  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
  };

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await api<GoogleStatus>("/api/google"));
    } catch {}
  }, []);

  const sync = useCallback(
    async (manual = false) => {
      setSyncing(true);
      try {
        await api("/api/google", { method: "POST" });
        emitChanged();
        if (manual) toast("Google Takvim ile senkronize edildi", "success");
      } catch (e) {
        if (manual) toast((e as Error).message, "error");
      } finally {
        setSyncing(false);
        loadStatus();
      }
    },
    [loadStatus],
  );

  // Toast dinleyicisi
  useEffect(() => {
    const h = (e: Event) => {
      const { message, kind } = (e as CustomEvent).detail;
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, message, kind }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
    };
    window.addEventListener("planlayici:toast", h);
    return () => window.removeEventListener("planlayici:toast", h);
  }, []);

  // Açılışta ve periyodik olarak senkronize et
  useEffect(() => {
    loadStatus().then(() => {});
    const t = setInterval(() => {
      if (document.visibilityState === "visible") sync(false);
    }, SYNC_EVERY_MS);
    return () => clearInterval(t);
  }, [loadStatus, sync]);

  useEffect(() => {
    if (status?.connected && !status.lastSync) sync(false);
    else if (status?.connected && status.lastSync && Date.now() - Date.parse(status.lastSync) > 2 * 60_000) sync(false);
    // yalnızca ilk durum yüklemesinde
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.connected]);

  // Etkinlik hatırlatıcıları (tarayıcı bildirimi)
  useEffect(() => {
    let reminderDefault = 10;
    api<{ reminderMin: number }>("/api/settings").then((s) => (reminderDefault = s.reminderMin)).catch(() => {});
    const check = async () => {
      try {
        const now = Date.now();
        const evs = await api<EventRow[]>(
          `/api/events?start=${new Date(now).toISOString()}&end=${new Date(now + 3 * 3600_000).toISOString()}`,
        );
        for (const e of evs) {
          if (e.all_day || e.start_ms < now) continue;
          const rem = (e.reminder_min ?? reminderDefault) * 60_000;
          const key = `${e.id}:${e.start_ms}`;
          if (now >= e.start_ms - rem && !notified.current.has(key)) {
            notified.current.add(key);
            const mins = Math.max(0, Math.round((e.start_ms - now) / 60_000));
            const msg = `${mins} dakika sonra başlıyor${e.location ? ` · ${e.location}` : ""}`;
            if ("Notification" in window && Notification.permission === "granted") {
              new Notification(e.title, { body: msg });
            } else toast(`⏰ ${e.title} — ${msg}`);
          }
        }
      } catch {}
    };
    check();
    const t = setInterval(check, 60_000);
    return () => clearInterval(t);
  }, []);

  // Otomatik plan kaydırma (ayarlardan açılırsa): yapılmadan geçen blokları sonraki boşluğa taşı
  useEffect(() => {
    const run = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const s = await api<{ autoReschedule: boolean }>("/api/settings");
        if (!s.autoReschedule) return;
        const r = await api<{ moved: number; planned: unknown[] }>("/api/schedule", { body: { catchUp: true } });
        if (r.moved) {
          toast(`${r.planned.length} iş sonraki boş saatlere kaydırıldı`, "info");
          emitChanged();
        }
      } catch {}
    };
    const first = setTimeout(run, 15_000);
    const t = setInterval(run, 10 * 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);

  // Hızlı yakalama: her sayfada "+" düğmesi ve N kısayolu
  const [captureOpen, setCaptureOpen] = useState(false);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable=true]") || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setCaptureOpen(true);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <div className="flex min-h-screen">
      {/* Masaüstü kenar çubuğu */}
      <aside className="panel sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r px-3 py-5 md:flex">
        <Link href="/" className="mb-6 flex items-center gap-2 px-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">
            <CalendarDays size={18} />
          </span>
          <span className="text-lg font-bold tracking-tight">Planlayıcı</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                isActive(href)
                  ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-100"
                  : "muted hover:bg-black/5 dark:hover:bg-white/5"
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="space-y-2 border-t border-theme pt-3">
          <GoogleBadge status={status} syncing={syncing} onSync={() => sync(true)} />
          <button onClick={toggleTheme} className="btn-ghost w-full justify-start border-0">
            {dark ? <Sun size={16} /> : <Moon size={16} />}
            {dark ? "Açık tema" : "Koyu tema"}
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 pb-24 pt-5 md:px-8 md:pb-8">
        {/* Mobil üst çubuk */}
        <div className="mb-4 flex items-center justify-between md:hidden">
          <span className="text-lg font-bold">Planlayıcı</span>
          <div className="flex items-center gap-1">
            {status?.connected && (
              <button onClick={() => sync(true)} className="btn-ghost border-0 p-2" aria-label="Senkronize et">
                <RefreshCw size={18} className={syncing ? "animate-spin" : ""} />
              </button>
            )}
            <button onClick={toggleTheme} className="btn-ghost border-0 p-2" aria-label="Tema">
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </div>
        {children}
      </main>

      {/* Mobil alt menü: ilk 4 sayfa + "Daha" */}
      {moreOpen && (
        <div className="fixed inset-0 z-30 md:hidden" onClick={() => setMoreOpen(false)}>
          <div className="panel absolute inset-x-3 bottom-20 grid grid-cols-4 gap-1 rounded-2xl border p-2 shadow-xl">
            {NAV.slice(MOBILE_MAIN).map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center gap-1 rounded-xl py-3 text-xs ${isActive(href) ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-100" : "muted"}`}
              >
                <Icon size={20} />
                {label}
              </Link>
            ))}
          </div>
        </div>
      )}
      <nav className="panel fixed inset-x-0 bottom-0 z-40 flex border-t pb-[env(safe-area-inset-bottom)] md:hidden">
        {NAV.slice(0, MOBILE_MAIN).map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${
              isActive(href) ? "text-brand-600" : "muted"
            }`}
          >
            <Icon size={20} />
            <span className="max-w-full truncate">{label}</span>
          </Link>
        ))}
        <button
          onClick={() => setMoreOpen((o) => !o)}
          className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${
            moreOpen || NAV.slice(MOBILE_MAIN).some((n) => isActive(n.href)) ? "text-brand-600" : "muted"
          }`}
        >
          <MoreHorizontal size={20} />
          Daha
        </button>
      </nav>

      {/* Hızlı yakalama */}
      {path !== "/planla" && (
        <button
          onClick={() => setCaptureOpen(true)}
          className="fixed bottom-20 right-4 z-30 grid h-14 w-14 place-items-center rounded-full bg-brand-600 text-white shadow-lg transition hover:scale-105 hover:bg-brand-700 md:bottom-6 md:right-6"
          aria-label="Hızlı görev ekle (N)"
          title="Hızlı görev ekle (N)"
        >
          <Plus size={26} />
        </button>
      )}
      <CaptureModal open={captureOpen} onClose={() => setCaptureOpen(false)} />

      <div className="fixed left-1/2 top-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`max-w-sm rounded-xl px-4 py-3 text-sm text-white shadow-lg ${
              t.kind === "error" ? "bg-red-600" : t.kind === "success" ? "bg-emerald-600" : "bg-gray-900"
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Aklına geleni hemen yaz: görev gelen kutusuna düşer, sabah planında önüne gelir. */
function CaptureModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const projects = useApi<ProjectStats[]>(open ? "/api/projects" : null);
  return (
    <Modal open={open} onClose={onClose} title="Hızlı ekle">
      <QuickAdd
        autoFocus
        projects={projects.data ?? []}
        onAdded={(t) => {
          toast(`"${t.title}" eklendi`, "success");
          emitChanged();
          onClose();
        }}
      />
      <p className="muted mt-3 text-xs">
        <b>yarın</b>, <b>cuma</b>, <b>15.10</b> · <b>45dk</b>, <b>2s</b> · <b>!1</b>–<b>!4</b> öncelik · <b>#proje</b> ·{" "}
        <b>her gün/hafta/ay</b>. Tarih vermezsen sabah planında karşına çıkar.
      </p>
    </Modal>
  );
}

function GoogleBadge({ status, syncing, onSync }: { status: GoogleStatus | null; syncing: boolean; onSync: () => void }) {
  if (!status) return null;
  if (!status.connected)
    return (
      <Link href="/ayarlar" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs muted hover:bg-black/5">
        <span className="h-2 w-2 rounded-full bg-gray-400" />
        Google Takvim bağlı değil
      </Link>
    );
  return (
    <button
      onClick={onSync}
      title={status.lastError ?? undefined}
      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-black/5 dark:hover:bg-white/5"
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${status.lastError ? "bg-amber-500" : "bg-emerald-500"}`} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{status.email}</span>
        <span className="muted">
          {syncing
            ? "Senkronize ediliyor…"
            : status.lastSync
              ? `Son senkron ${new Date(status.lastSync).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`
              : "Henüz senkron yok"}
        </span>
      </span>
      <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
    </button>
  );
}
