import { all } from "@/lib/db";
import { body, json, route } from "@/lib/http";
import { pushReady, sendToAll, subscribe, unsubscribe } from "@/lib/push";

export const dynamic = "force-dynamic";

/** Bildirim durumu ve tarayıcının abone olması için açık anahtar */
export const GET = route(async () => {
  const subs = await all<{ endpoint: string }>("SELECT endpoint FROM push_subscriptions");
  return json({ ready: pushReady(), publicKey: process.env.VAPID_PUBLIC_KEY ?? null, devices: subs.length });
});

/** Cihaz kaydı ya da { test: true } ile deneme bildirimi */
export const POST = route(async (req) => {
  const b = await body<{ test?: boolean; endpoint?: string; keys?: { p256dh: string; auth: string } }>(req);
  if (!pushReady()) throw new Error("Bildirim anahtarları sunucuda tanımlı değil");
  if (b.test) {
    const sent = await sendToAll({ title: "Bildirimler çalışıyor", body: "Oturum, ders, son tarih ve alışkanlık hatırlatmaları buraya gelecek.", url: "/" });
    return json({ sent });
  }
  if (!b.endpoint || !b.keys?.p256dh || !b.keys?.auth) throw new Error("Geçersiz abonelik");
  await subscribe({ endpoint: b.endpoint, keys: b.keys });
  return json({ ok: true });
});

export const DELETE = route(async (req) => {
  const b = await body<{ endpoint?: string }>(req);
  if (b.endpoint) await unsubscribe(b.endpoint);
  return json({ ok: true });
});
