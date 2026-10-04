import { ymd } from "@/lib/db";
import { body, json, route } from "@/lib/http";
import { getPlanData, planDay, saveWeek, type PlanItem, type Window } from "@/lib/sessions";

export const dynamic = "force-dynamic";

const validDate = (d: unknown) => (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : ymd(new Date()));

/** Planla ekranı verisi: haftanın seçili projeleri ve günün oturumları */
export const GET = route(async (req) => json(await getPlanData(validDate(new URL(req.url).searchParams.get("date")))));

/** Haftalık seçim kaydı */
export const PUT = route(async (req) => {
  const b = await body<{ date?: string; items?: PlanItem[] }>(req);
  await saveWeek(validDate(b.date), b.items ?? []);
  return json({ ok: true });
});

/** Günün oturumlarını yerleştir (dryRun: yalnızca önizleme) */
export const POST = route(async (req) => {
  const b = await body<{ date?: string; windows?: Window[]; items?: PlanItem[]; dryRun?: boolean }>(req);
  const windows = (b.windows ?? []).filter((w) => /^\d{2}:\d{2}$/.test(w.start) && /^\d{2}:\d{2}$/.test(w.end));
  if (!windows.length) throw new Error("En az bir boş saat aralığı gir");
  return json(await planDay(validDate(b.date), windows, b.items ?? [], Boolean(b.dryRun)));
});
