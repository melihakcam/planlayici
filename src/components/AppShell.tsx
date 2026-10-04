"use client";

import {
  AlertCircle,
  BarChart3,
  BookOpen,
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  Info,
  CalendarRange,
  CheckSquare,
  Flame,
  FolderKanban,
  GraduationCap,
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
import ProgressBadge from "./ProgressBadge";
import QuickAdd from "./QuickAdd";
import { emitChanged, toast, type ToastKind } from "./toast";

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard };
const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Plan",
    items: [
      { href: "/", label: "Bugün", icon: LayoutDashboard },
      { href: "/planla", label: "Günü planla", icon: Sunrise },
      { href: "/takvim", label: "Takvim", icon: CalendarDays },
      { href: "/gorevler", label: "Görevler", icon: CheckSquare },
      { href: "/projeler", label: "Projeler", icon: FolderKanban },
      { href: "/ders-programi", label: "Ders programı", icon: GraduationCap },
    ],
  },
  {
    title: "Gelişim",
    items: [
      { href: "/odak", label: "Odak", icon: Timer },
      { href: "/aliskanliklar", label: "Alışkanlıklar", icon: Flame },
      { href: "/haftalik", label: "Haftalık", icon: CalendarRange },
      { href: "/istatistik", label: "İstatistik", icon: BarChart3 },
      { href: "/gunluk", label: "Günlük", icon: BookOpen },
    ],
  },
];
const SETTINGS_NAV: NavItem = { href: "/ayarlar", label: "Ayarlar", icon: Settings };
const NAV: NavItem[] = [...NAV_GROUPS.flatMap((g) => g.items), SETTINGS_NAV];
/** Mobil alt menü: en sık kullanılanlar (≤ 5 öğe kuralı: 4 + Daha) */
const MOBILE_MAIN = ["/", "/takvim", "/gorevler", "/odak"];

type GoogleStatus = { connected: boolean; email: string | null; lastSync: string | null; lastError: string | null };

const SYNC_EVERY_MS = 5 * 60_000;

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
            } else toast(`Hatırlatma: ${e.title} — ${msg}`);
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

  // Telefona kurulum (PWA): service worker yalnızca üretim derlemesinde kaydedilir
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
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
  const mobileMain = MOBILE_MAIN.map((h) => NAV.find((n) => n.href === h)!);
  const mobileMore = NAV.filter((n) => !MOBILE_MAIN.includes(n.href));

  const navLink = ({ href, label, icon: Icon }: NavItem) => {
    const active = isActive(href);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={`group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition duration-150 ${
          active ? "bg-[var(--primary-soft)] text-brand-700 dark:text-brand-200" : "muted hover:bg-black/[0.04] hover:text-[var(--text)] dark:hover:bg-white/[0.05]"
        }`}
      >
        {active && <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-brand-600" aria-hidden />}
        <Icon size={18} strokeWidth={active ? 2.25 : 2} />
        {label}
      </Link>
    );
  };

  return (
    <div className="flex min-h-dvh">
      <a href="#icerik" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-xl focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-white">
        İçeriğe geç
      </a>

      {/* Masaüstü kenar çubuğu */}
      <aside className="panel sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r px-3 py-5 md:flex">
        <Link href="/" className="mb-5 flex items-center gap-2.5 px-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white shadow-sm shadow-brand-600/30">
            <CalendarCheck2 size={19} />
          </span>
          <span className="text-lg font-extrabold tracking-tight">Planlayıcı</span>
        </Link>
        <ProgressBadge />
        <nav className="mt-4 flex flex-1 flex-col gap-4 overflow-y-auto" aria-label="Ana menü">
          {NAV_GROUPS.map((g) => (
            <div key={g.title}>
              <p className="eyebrow muted mb-1 px-3">{g.title}</p>
              <div className="flex flex-col gap-0.5">{g.items.map(navLink)}</div>
            </div>
          ))}
        </nav>
        <div className="space-y-1 border-t border-theme pt-3">
          {navLink(SETTINGS_NAV)}
          <GoogleBadge status={status} syncing={syncing} onSync={() => sync(true)} />
          <button onClick={toggleTheme} className="btn-ghost w-full justify-start border-0 font-medium">
            {dark ? <Sun size={16} /> : <Moon size={16} />}
            {dark ? "Açık tema" : "Koyu tema"}
          </button>
        </div>
      </aside>

      <main id="icerik" className="min-w-0 flex-1 px-4 pb-28 pt-4 md:px-8 md:pb-10 md:pt-6">
        {/* Mobil üst çubuk */}
        <div className="mb-4 flex items-center justify-between md:hidden">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">
              <CalendarCheck2 size={17} />
            </span>
            <span className="text-lg font-extrabold tracking-tight">Planlayıcı</span>
          </Link>
          <div className="flex items-center gap-1">
            <ProgressBadge compact />
            {status?.connected && (
              <button onClick={() => sync(true)} className="btn-ghost h-11 w-11 border-0 p-0" aria-label="Google Takvim ile senkronize et">
                <RefreshCw size={18} className={syncing ? "animate-spin" : ""} />
              </button>
            )}
            <button onClick={toggleTheme} className="btn-ghost h-11 w-11 border-0 p-0" aria-label={dark ? "Açık temaya geç" : "Koyu temaya geç"}>
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </div>
        {children}
      </main>

      {/* Mobil alt menü: 4 ana sayfa + "Daha" */}
      {moreOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setMoreOpen(false)}>
          <div className="panel animate-rise absolute inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] grid grid-cols-3 gap-1 rounded-2xl border p-2 shadow-xl">
            {mobileMore.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl py-3 text-xs font-medium ${isActive(href) ? "bg-[var(--primary-soft)] text-brand-700 dark:text-brand-200" : "muted"}`}
              >
                <Icon size={20} />
                {label}
              </Link>
            ))}
          </div>
        </div>
      )}
      <nav className="panel fixed inset-x-0 bottom-0 z-40 flex border-t pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Alt menü">
        {mobileMain.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(href) ? "page" : undefined}
            className={`flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
              isActive(href) ? "text-brand-600 dark:text-brand-500" : "muted"
            }`}
          >
            <Icon size={21} strokeWidth={isActive(href) ? 2.4 : 2} />
            <span className="max-w-full truncate">{label}</span>
          </Link>
        ))}
        <button
          onClick={() => setMoreOpen((o) => !o)}
          aria-expanded={moreOpen}
          className={`flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
            moreOpen || mobileMore.some((n) => isActive(n.href)) ? "text-brand-600 dark:text-brand-500" : "muted"
          }`}
        >
          <MoreHorizontal size={21} />
          Daha
        </button>
      </nav>

      {/* Hızlı yakalama */}
      {path !== "/planla" && path !== "/odak" && (
        <button
          onClick={() => setCaptureOpen(true)}
          className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-30 grid h-14 w-14 place-items-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/30 transition duration-150 hover:bg-brand-700 active:scale-95 md:bottom-6 md:right-6"
          aria-label="Hızlı görev ekle (kısayol: N)"
          title="Hızlı görev ekle (N)"
        >
          <Plus size={26} />
        </button>
      )}
      <CaptureModal open={captureOpen} onClose={() => setCaptureOpen(false)} />

      <div
        className="pointer-events-none fixed left-1/2 top-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 flex-col gap-2"
        aria-live="polite"
        role="status"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-rise flex items-start gap-2 rounded-2xl px-4 py-3 text-sm font-medium text-white shadow-lg ${
              t.kind === "error" ? "bg-red-600" : t.kind === "success" ? "bg-success-600" : "bg-slate-900 dark:bg-slate-700"
            }`}
          >
            {t.kind === "error" ? <AlertCircle size={18} className="mt-px shrink-0" /> : t.kind === "success" ? <CheckCircle2 size={18} className="mt-px shrink-0" /> : <Info size={18} className="mt-px shrink-0" />}
            <span>{t.message}</span>
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
