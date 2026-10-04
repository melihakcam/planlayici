import { deleteHabit, logHabit, updateHabit } from "@/lib/habits";
import { body, json, route, type IdCtx } from "@/lib/http";

export const PATCH = route<IdCtx>(async (req, { params }) => {
  await updateHabit((await params).id, await body(req));
  return json({ ok: true });
});

export const DELETE = route<IdCtx>(async (_req, { params }) => {
  await deleteHabit((await params).id);
  return json({ ok: true });
});

/** Günlük kayıt: { date, count } ya da { date, delta } */
export const POST = route<IdCtx>(async (req, { params }) => {
  const b = await body<{ date: string; count?: number; delta?: number }>(req);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || "")) return json({ error: "Geçersiz tarih" }, 400);
  return json({ count: await logHabit((await params).id, b.date, b) });
});
