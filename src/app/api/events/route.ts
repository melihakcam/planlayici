import { createEvent, listEvents, type EventInput } from "@/lib/events";
import { body, json, route } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const u = new URL(req.url);
  const from = Date.parse(u.searchParams.get("start") || "") || Date.now() - 7 * 864e5;
  const to = Date.parse(u.searchParams.get("end") || "") || Date.now() + 30 * 864e5;
  return json(await listEvents(from, to));
});

export const POST = route(async (req) => json(await createEvent(await body<EventInput>(req)), 201));
