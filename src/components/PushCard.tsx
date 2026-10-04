"use client";

import { Bell, BellRing, Send } from "lucide-react";
import { useEffect, useState } from "react";
import type { Settings } from "@/lib/settings";
import { api, useApi } from "@/lib/client";
import { toast } from "./toast";

type Notify = Settings["notify"];

/** base64url → Uint8Array (tarayıcının abonelik için istediği biçim) */
function keyBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Telefon bildirimleri: bu cihazı kaydet, deneme gönder, hangi bildirimlerin geleceğini seç. */
export default function PushCard({ notify, onChange }: { notify: Notify; onChange: (n: Notify) => void }) {
  const status = useApi<{ ready: boolean; publicKey: string | null; devices: number }>("/api/push");
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;

  useEffect(() => {
    if (!supported) return setSubscribed(false);
    navigator.serviceWorker.getRegistration().then(async (r) => setSubscribed(Boolean(await r?.pushManager.getSubscription())));
  }, [supported]);

  const enable = async () => {
    if (!status.data?.publicKey) return toast("Bildirim anahtarları sunucuda tanımlı değil", "error");
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error("Bildirim izni verilmedi. Tarayıcı ayarlarından izin verebilirsin.");
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(status.data.publicKey) }));
      await api("/api/push", { method: "POST", body: sub.toJSON() });
      setSubscribed(true);
      status.reload();
      toast("Bu cihaz bildirim alacak", "success");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await api("/api/push", { method: "DELETE", body: { endpoint: sub.endpoint } });
      await sub.unsubscribe();
    }
    setSubscribed(false);
    status.reload();
  };

  const test = async () => {
    try {
      const r = await api<{ sent: number }>("/api/push", { method: "POST", body: { test: true } });
      toast(r.sent ? `Deneme bildirimi ${r.sent} cihaza gönderildi` : "Kayıtlı cihaz yok", r.sent ? "success" : "error");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const set = (p: Partial<Notify>) => onChange({ ...notify, ...p });

  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <BellRing size={18} className="text-violet-600" /> Telefon bildirimleri
        </h2>
        {status.data && <span className="muted text-xs">{status.data.devices} kayıtlı cihaz</span>}
      </div>

      {!supported ? (
        <p className="muted text-sm">Bu tarayıcı bildirimleri desteklemiyor. Telefonda Chrome ile açıp ana ekrana ekle.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {subscribed ? (
            <>
              <button className="btn-ghost" onClick={test}>
                <Send size={16} /> Deneme bildirimi gönder
              </button>
              <button className="btn-danger" onClick={disable}>
                Bu cihazda kapat
              </button>
            </>
          ) : (
            <button className="btn hero-gradient text-white shadow-lg" onClick={enable} disabled={busy || subscribed === null}>
              <Bell size={16} /> {busy ? "Açılıyor…" : "Bu cihazda bildirimleri aç"}
            </button>
          )}
        </div>
      )}

      <div className="space-y-3">
        <label className="flex min-h-11 items-center justify-between gap-3">
          <span className="text-sm">Çalışma oturumu başlarken</span>
          <input type="checkbox" className="h-5 w-5 accent-violet-600" checked={notify.sessions} onChange={(e) => set({ sessions: e.target.checked })} />
        </label>
        <label className="flex min-h-11 items-center justify-between gap-3">
          <span className="text-sm">Ders ve kurstan önce (dk, 0 = kapalı)</span>
          <input type="number" className="input w-24" min={0} max={120} value={notify.classesMin} onChange={(e) => set({ classesMin: Number(e.target.value) || 0 })} />
        </label>
        <label className="flex min-h-11 items-center justify-between gap-3">
          <span className="text-sm">Diğer etkinliklerden önce (dk, 0 = kapalı)</span>
          <input type="number" className="input w-24" min={0} max={1440} value={notify.eventsMin} onChange={(e) => set({ eventsMin: Number(e.target.value) || 0 })} />
        </label>
        <label className="flex min-h-11 items-center justify-between gap-3">
          <span className="text-sm">Son tarihler (önceki akşam 20:00 ve o gün 09:00)</span>
          <input type="checkbox" className="h-5 w-5 accent-violet-600" checked={notify.deadlines} onChange={(e) => set({ deadlines: e.target.checked })} />
        </label>
        <label className="flex min-h-11 items-center justify-between gap-3">
          <span className="text-sm">&quot;Yarını planla&quot; hatırlatması (boş = kapalı)</span>
          <input type="time" className="input w-32" value={notify.planTime} onChange={(e) => set({ planTime: e.target.value })} />
        </label>
        <p className="muted text-xs">Alışkanlık hatırlatmaları (ör. 30 dakikada bir su) her alışkanlığın kendi ayarından açılır. Değişikliklerden sonra aşağıdan Kaydet&apos;e bas.</p>
      </div>
    </section>
  );
}
