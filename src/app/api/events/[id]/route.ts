import { deleteEvent, getEvent, updateEvent, type EventInput } from "@/lib/events";
import { body, json, route, type IdCtx } from "@/lib/http";

export const GET = route<IdCtx>(async (_req, { params }) => {
  const ev = await getEvent((await params).id);
  return ev ? json(ev) : json({ error: "Bulunamadı" }, 404);
});

export const PATCH = route<IdCtx>(async (req, { params }) =>
  json(await updateEvent((await params).id, await body<EventInput>(req))),
);

export const DELETE = route<IdCtx>(async (req, { params }) => {
  const series = new URL(req.url).searchParams.get("series") === "1";
  await deleteEvent((await params).id, series);
  return json({ ok: true });
});
