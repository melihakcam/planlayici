"use client";

import { Bell, Download, ExternalLink, Layers, Link2, LogOut, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { emitChanged, toast } from "@/components/toast";
import { api, useApi, WEEKDAYS_SHORT } from "@/lib/client";
import PushCard from "@/components/PushCard";
import type { CalendarRow } from "@/lib/types";

type GoogleStatus = {
  configured: boolean;
  connected: boolean;
  redirectUri: string;
  email: string | null;
  name: string | null;
  picture: string | null;
  lastSync: string | null;
  lastError: string | null;
  pending: number;
};

type Settings = {
  notify: import("@/lib/settings").Settings["notify"];
  workStart: string;
  workEnd: string;
  workDays: string;
  timeZone: string;
  defaultDuration: number;
  bufferMin: number;
  planDays: number;
  reminderMin: number;
  weekStart: number;
  pomodoroFocus: number;
  pomodoroBreak: number;
  pomodoroLong: number;
  planCalendarId: string;
  daySchedule: Record<string, { start: string; end: string } | null> | null;
  autoReschedule: boolean;
  dailyMaxMinutes: number;
  dailyFocusGoal: number;
};

const WEEKDAYS_LONG = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

const ROLE_LABEL: Record<string, string> = { owner: "Sahibi", writer: "Düzenleyebilir", reader: "Salt okunur", local: "Sadece planlayıcıda" };

const GOOGLE_MESSAGES: Record<string, [string, "success" | "error" | "info"]> = {
  baglandi: ["Google Takvim bağlandı ve senkronize edildi", "success"],
  iptal: ["Google bağlantısı iptal edildi", "info"],
  gecersiz: ["Güvenlik doğrulaması başarısız, tekrar deneyin", "error"],
  hata: ["Google bağlantısı kurulamadı. Terminal çıktısını kontrol edin.", "error"],
  "izin-eksik": [
    "Takvim izni verilmedi. Tekrar bağlanın ve izin ekranında takvim kutucuğunu işaretleyin.",
    "error",
  ],
  yapilandirilmamis: ["Önce .env.local dosyasına Google anahtarlarını ekleyin", "error"],
};

export default function SettingsPage() {
  const google = useApi<GoogleStatus>("/api/google");
  const settings = useApi<Settings>("/api/settings");
  const calendars = useApi<CalendarRow[]>("/api/calendars");
  const [calBusy, setCalBusy] = useState<string | null>(null);
  const [form, setForm] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (settings.data) setForm(settings.data);
  }, [settings.data]);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("google");
    if (q && GOOGLE_MESSAGES[q]) {
      toast(...GOOGLE_MESSAGES[q]);
      window.history.replaceState(null, "", "/ayarlar");
      if (q === "baglandi") emitChanged();
    }
  }, []);

  const sync = async () => {
    setBusy(true);
    try {
      await api("/api/google", { method: "POST" });
      toast("Senkronize edildi", "success");
      emitChanged();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
      google.reload();
      calendars.reload();
    }
  };

  const disconnect = async () => {
    if (!confirm("Google Takvim bağlantısı kesilsin mi? Google'dan gelen etkinlikler uygulamadan kaldırılır (Google'da silinmez).")) return;
    await api("/api/google", { method: "DELETE" });
    toast("Bağlantı kesildi");
    google.reload();
    calendars.reload();
    emitChanged();
  };

  const save = async () => {
    if (!form) return;
    try {
      setForm(await api<Settings>("/api/settings", { method: "PUT", body: form }));
      toast("Ayarlar kaydedildi", "success");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const toggleCalendar = async (c: CalendarRow) => {
    if (c.selected && !confirm(`"${c.summary}" senkrondan çıkarılsın mı? Etkinlikleri uygulamadan kaldırılır (Google'da kalır).`)) return;
    setCalBusy(c.id);
    try {
      calendars.setData(await api<CalendarRow[]>(`/api/calendars/${encodeURIComponent(c.id)}`, { method: "PATCH", body: { selected: !c.selected } }));
      emitChanged();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setCalBusy(null);
    }
  };

  const setPlanCalendar = async (id: string) => {
    setForm((f) => (f ? { ...f, planCalendarId: id } : f));
    await api("/api/settings", { method: "PUT", body: { planCalendarId: id } });
    toast("Varsayılan takvim güncellendi", "success");
  };

  const set = (p: Partial<Settings>) => setForm((f) => (f ? { ...f, ...p } : f));

  // Güne özel saatler; henüz ayarlanmadıysa genel çalışma saatlerinden türetilir.
  const daySchedule: Record<string, { start: string; end: string } | null> =
    form?.daySchedule ??
    Object.fromEntries(
      [0, 1, 2, 3, 4, 5, 6].map((d) => [
        String(d),
        form?.workDays.includes(String(d)) ? { start: form.workStart, end: form.workEnd } : null,
      ]),
    );
  const setDay = (d: number, win: { start: string; end: string } | null) =>
    set({ daySchedule: { ...daySchedule, [String(d)]: win } });
  const writableCals = (calendars.data ?? []).filter((c) => c.selected && c.access_role !== "reader");
  const g = google.data;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Ayarlar</h1>

      {/* Google Takvim */}
      <section className="card space-y-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15">
            <Link2 size={20} />
          </span>
          <div>
            <h2 className="font-semibold">Google Takvim</h2>
            <p className="muted text-xs">Etkinlikler iki yönlü senkronize edilir.</p>
          </div>
        </div>

        {!g && <div className="space-y-3" aria-busy="true" aria-label="Yükleniyor"><div className="skeleton h-12" /></div>}

        {g && !g.configured && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            <p className="mb-2 font-semibold">Google anahtarları henüz eklenmemiş</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                <a className="underline" href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">
                  Google Cloud Console
                </a>{" "}
                üzerinde yeni proje oluştur.
              </li>
              <li>
                <a className="underline" href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" target="_blank" rel="noreferrer">
                  Google Calendar API
                </a>{" "}
                → <b>Enable</b>.
              </li>
              <li>
                <b>OAuth consent screen</b> → External → uygulama adı ve e-posta → <b>Test users</b>&apos;a kendi Gmail adresini ekle.
              </li>
              <li>
                <b>Credentials</b> → Create credentials → <b>OAuth client ID</b> → Web application.
              </li>
              <li>
                Authorized redirect URI: <code className="rounded bg-black/10 px-1">{g.redirectUri}</code>
              </li>
              <li>
                Proje klasöründe <code className="rounded bg-black/10 px-1">.env.local</code> dosyasına <code>GOOGLE_CLIENT_ID</code> ve{" "}
                <code>GOOGLE_CLIENT_SECRET</code> değerlerini yaz, sunucuyu yeniden başlat.
              </li>
            </ol>
            <p className="mt-2">Ayrıntılı anlatım: README.md</p>
          </div>
        )}

        {g?.configured && !g.connected && (
          <div className="space-y-3">
            {g.lastError && <p className="text-sm text-red-600">{g.lastError}</p>}
            <a href="/api/google/connect" className="btn-primary">
              <ExternalLink size={16} /> Google hesabını bağla
            </a>
            <p className="muted text-xs">
              Google&apos;ın &quot;Bu uygulama doğrulanmadı&quot; uyarısı çıkarsa: <b>Gelişmiş</b> → <b>… adresine git</b>. Bu, kendi oluşturduğun uygulama için normaldir.
            </p>
          </div>
        )}

        {g?.connected && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-xl border border-theme p-3">
              {g.picture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={g.picture} alt="" className="h-10 w-10 rounded-full" referrerPolicy="no-referrer" />
              ) : (
                <span className="h-10 w-10 rounded-full bg-brand-600" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{g.name}</p>
                <p className="muted truncate text-xs">{g.email}</p>
              </div>
              <span className="chip bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">Bağlı</span>
            </div>
            <p className="muted text-xs">
              Son senkron: {g.lastSync ? new Date(g.lastSync).toLocaleString("tr-TR") : "—"}
              {g.pending > 0 && ` · ${g.pending} değişiklik gönderilmeyi bekliyor`}
            </p>
            {g.lastError && <p className="text-sm text-amber-600">Son hata: {g.lastError}</p>}
            {(calendars.data ?? []).length > 0 && (
              <div className="space-y-3 rounded-xl border border-theme p-3">
                <div>
                  <p className="text-sm font-semibold">Takvimler</p>
                  <p className="muted text-xs">İşaretli takvimler senkronize edilir ve akıllı planlamada dolu saat sayılır.</p>
                </div>
                <ul className="space-y-1">
                  {calendars.data!.filter((c) => !c.id.startsWith("local:")).map((c) => (
                    <li key={c.id}>
                      <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-black/5 dark:hover:bg-white/5">
                        <input
                          type="checkbox"
                          checked={Boolean(c.selected)}
                          disabled={calBusy === c.id}
                          onChange={() => toggleCalendar(c)}
                        />
                        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: c.color }} />
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {c.summary}
                          {c.is_primary ? <span className="muted"> · birincil</span> : null}
                        </span>
                        <span className="muted shrink-0 text-xs">{calBusy === c.id ? "…" : (ROLE_LABEL[c.access_role] ?? c.access_role)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                <label className="block">
                  <span className="label">Yeni etkinlikler ve akıllı planlama bu takvime yazılsın</span>
                  <select className="input" value={form?.planCalendarId ?? "primary"} onChange={(e) => setPlanCalendar(e.target.value)}>
                    {writableCals.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.summary}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" onClick={sync} disabled={busy}>
                <RefreshCw size={16} className={busy ? "animate-spin" : ""} /> Şimdi senkronize et
              </button>
              <button className="btn-danger" onClick={disconnect}>
                <LogOut size={16} /> Bağlantıyı kes
              </button>
            </div>
          </div>
        )}
      </section>

      <LocalCalendars calendars={calendars.data ?? []} onChange={(list) => { calendars.setData(list); emitChanged(); }} />

      {form && (
        <>
          {/* Planlama */}
          <section className="card space-y-4">
            <div>
              <h2 className="font-semibold">Planlama saatleri</h2>
              <p className="muted text-xs">
                Akıllı planlama işleri sadece bu saatlere yerleştirir. Ders, iş, toplantı gibi sabit işlerin Google
                Takvim&apos;den gelir ve dolu sayılır; burada sadece projelere ayırabileceğin genel aralığı belirle.
              </p>
            </div>
            <div className="space-y-1.5">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                const win = daySchedule[String(d)];
                return (
                  <div key={d} className="flex items-center gap-2">
                    <label className="flex w-24 shrink-0 items-center gap-2 text-sm">
                      <input type="checkbox" checked={Boolean(win)} onChange={(e) => setDay(d, e.target.checked ? { start: form.workStart, end: form.workEnd } : null)} />
                      {WEEKDAYS_LONG[d]}
                    </label>
                    {win ? (
                      <>
                        <input type="time" className="input max-w-32 py-1.5" value={win.start} onChange={(e) => setDay(d, { ...win, start: e.target.value })} />
                        <span className="muted">–</span>
                        <input type="time" className="input max-w-32 py-1.5" value={win.end} onChange={(e) => setDay(d, { ...win, end: e.target.value })} />
                      </>
                    ) : (
                      <span className="muted text-xs">Bu gün planlama yapılmaz</span>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="muted -mb-2 text-xs">
              Günlük sınır, akıllı planlamanın bir güne koyacağı görev bloklarının toplamıdır; ders ve sabit etkinlikler buna dahil değildir. 0 = sınır yok.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Kaç gün ileri planla">
                <Num value={form.planDays} min={1} max={30} onChange={(v) => set({ planDays: v })} />
              </Field>
              <Field label="İşler arası mola (dk)">
                <Num value={form.bufferMin} min={0} max={60} onChange={(v) => set({ bufferMin: v })} />
              </Field>
              <Field label="Günde en fazla iş (saat)">
                <input
                  type="number"
                  className="input"
                  min={0}
                  max={16}
                  step={0.5}
                  value={form.dailyMaxMinutes / 60}
                  onChange={(e) => set({ dailyMaxMinutes: Math.round(Math.min(16, Math.max(0, Number(e.target.value) || 0)) * 60) })}
                />
              </Field>
              <Field label="Günlük odak hedefi (dk)">
                <Num value={form.dailyFocusGoal} min={15} max={600} onChange={(v) => set({ dailyFocusGoal: v })} />
              </Field>
            </div>
            <label className="flex items-start gap-3 rounded-xl border border-theme p-3">
              <input type="checkbox" className="mt-1" checked={form.autoReschedule} onChange={(e) => set({ autoReschedule: e.target.checked })} />
              <span>
                <span className="block text-sm font-medium">Kaçırılan işleri otomatik kaydır</span>
                <span className="muted block text-xs">
                  Planlandığı saat geçmiş ama tamamlanmamış işler, uygulama açıkken 10 dakikada bir sonraki boş saate taşınır.
                  Kapalıyken ana sayfada &quot;Planı kaydır&quot; düğmesi çıkar.
                </span>
              </span>
            </label>
          </section>

          {/* Takvim */}
          <section className="card space-y-4">
            <h2 className="font-semibold">Takvim ve hatırlatıcılar</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Varsayılan etkinlik süresi (dk)">
                <Num value={form.defaultDuration} min={5} max={480} onChange={(v) => set({ defaultDuration: v })} />
              </Field>
              <Field label="Hatırlatma (dk önce)">
                <Num value={form.reminderMin} min={0} max={1440} onChange={(v) => set({ reminderMin: v })} />
              </Field>
              <Field label="Haftanın ilk günü">
                <select className="input" value={form.weekStart} onChange={(e) => set({ weekStart: Number(e.target.value) })}>
                  <option value={1}>Pazartesi</option>
                  <option value={0}>Pazar</option>
                </select>
              </Field>
              <Field label="Saat dilimi">
                <input className="input" value={form.timeZone} readOnly disabled title="APP_TIMEZONE ortam değişkeniyle ayarlanır" />
              </Field>
            </div>
          </section>

          <PushCard notify={form.notify} onChange={(notify) => set({ notify })} />

          {/* Pomodoro */}
          <section className="card space-y-4">
            <h2 className="font-semibold">Odak (Pomodoro)</h2>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Odak (dk)">
                <Num value={form.pomodoroFocus} min={5} max={120} onChange={(v) => set({ pomodoroFocus: v })} />
              </Field>
              <Field label="Kısa mola (dk)">
                <Num value={form.pomodoroBreak} min={1} max={60} onChange={(v) => set({ pomodoroBreak: v })} />
              </Field>
              <Field label="Uzun mola (dk)">
                <Num value={form.pomodoroLong} min={1} max={60} onChange={(v) => set({ pomodoroLong: v })} />
              </Field>
            </div>
          </section>

          <div className="flex flex-wrap justify-between gap-2">
            <a href="/api/export" className="btn-ghost">
              <Download size={16} /> Verileri yedekle (JSON)
            </a>
            <button className="btn-primary" onClick={save}>
              Ayarları kaydet
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const CAL_COLORS = ["#7c3aed", "#3f51b5", "#0b8043", "#039be5", "#e67c73", "#f4511e", "#f6bf26", "#616161"];

/** Yalnızca planlayıcıda duran takvimler: Google'a hiç gönderilmez. */
function LocalCalendars({ calendars, onChange }: { calendars: CalendarRow[]; onChange: (list: CalendarRow[]) => void }) {
  const local = calendars.filter((c) => c.id.startsWith("local:"));
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const call = async (url: string, method: string, body?: unknown) => {
    setBusy(true);
    try {
      onChange(await api<CalendarRow[]>(url, { method, body }));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  const add = async () => {
    if (!name.trim()) return;
    await call("/api/calendars", "POST", { summary: name, color: CAL_COLORS[local.length % CAL_COLORS.length] });
    setName("");
  };
  return (
    <section className="card space-y-4">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
          <Layers size={20} />
        </span>
        <div>
          <h2 className="font-semibold">Planlayıcı takvimleri</h2>
          <p className="muted text-xs">Sadece bu uygulamada durur; Google'a hiç gönderilmez. Ders programı, kurslar ve kişisel planın için.</p>
        </div>
      </div>
      <ul className="space-y-2">
        {local.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-theme p-2">
            <label className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg" title="Rengi değiştir">
              <span className="absolute inset-0" style={{ background: c.color }} />
              <input
                type="color"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                value={c.color}
                onChange={(e) => call(`/api/calendars/${encodeURIComponent(c.id)}`, "PATCH", { color: e.target.value })}
                aria-label={`${c.summary} rengi`}
              />
            </label>
            <input
              className="input min-w-0 flex-1"
              defaultValue={c.summary}
              aria-label="Takvim adı"
              onBlur={(e) => e.target.value.trim() && e.target.value !== c.summary && call(`/api/calendars/${encodeURIComponent(c.id)}`, "PATCH", { summary: e.target.value })}
            />
            <button
              className="btn-danger h-10 w-10 p-0"
              disabled={busy}
              aria-label={`${c.summary} takvimini sil`}
              onClick={() => confirm(`"${c.summary}" takvimi ve içindeki tüm etkinlikler silinsin mi?`) && call(`/api/calendars/${encodeURIComponent(c.id)}`, "DELETE")}
            >
              <Trash2 size={16} />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input className="input" placeholder="Yeni takvim adı (ör. Spor, Kulüp)" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="btn-primary shrink-0" onClick={add} disabled={busy || !name.trim()}>
          <Plus size={16} /> Ekle
        </button>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

function Num({ value, onChange, min, max }: { value: number; onChange: (v: number) => void; min: number; max: number }) {
  return (
    <input
      type="number"
      className="input"
      min={min}
      max={max}
      value={value}
      onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))}
    />
  );
}
