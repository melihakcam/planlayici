import { get } from "@/lib/db";
import { syncNow } from "@/lib/events";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Vercel Cron ile günde bir çağrılır: Supabase ücretsiz projesinin
 * hareketsizlikten duraklatılmasını önler ve Google Takvim'i senkronlar.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return json({ error: "Yetkisiz" }, 401);
  }
  await get("SELECT 1 AS ok");
  let sync = "atlandı";
  try {
    await syncNow();
    sync = "tamam";
  } catch (e) {
    sync = (e as Error).message;
  }
  return json({ ok: true, sync, at: new Date().toISOString() });
}
