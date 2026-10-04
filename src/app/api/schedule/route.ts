import { syncNow } from "@/lib/events";
import { body, json, route } from "@/lib/http";
import { autoPlan, catchUp, freeSlots } from "@/lib/scheduler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Bugünkü boş zaman aralıkları */
export const GET = route(async () => json(await freeSlots(Date.now(), 1)));

/**
 * { replan?, taskIds?, days? } → akıllı planla
 * { catchUp: true } → yapılmadan geçen blokları sonraki boşluğa kaydır
 */
export const POST = route(async (req) => {
  const b = await body<{ replan?: boolean; taskIds?: string[]; days?: number; catchUp?: boolean }>(req);
  // Planlamadan önce Google'daki son durumu al ki çakışma olmasın.
  await syncNow().catch(() => {});
  if (b.catchUp) return json(await catchUp());
  return json(await autoPlan(b));
});
