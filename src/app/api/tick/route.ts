import { json } from "@/lib/http";
import { pushReady, tick } from "@/lib/push";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Dış zamanlayıcı (cron-job.org) 5 dakikada bir çağırır ve zamanı gelen bildirimler gönderilir.
 * Yetki: "Authorization: Bearer <CRON_SECRET>" başlığı ya da ?key=<CRON_SECRET>.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const key = new URL(req.url).searchParams.get("key");
  if (!secret || (req.headers.get("authorization") !== `Bearer ${secret}` && key !== secret)) {
    return json({ error: "Yetkisiz" }, 401);
  }
  if (!pushReady()) return json({ error: "Bildirim anahtarları tanımlı değil" }, 500);
  return json({ ok: true, ...(await tick()), at: new Date().toISOString() });
}
