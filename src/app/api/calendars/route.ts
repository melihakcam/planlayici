import { createLocalCalendar, listCalendars } from "@/lib/calendars";
import { body, json, route } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = route(async () => json(await listCalendars()));

/** Yalnızca planlayıcıda duran yeni takvim */
export const POST = route(async (req) => {
  const b = await body<{ summary?: string; color?: string }>(req);
  await createLocalCalendar(b.summary ?? "", b.color ?? "");
  return json(await listCalendars(), 201);
});
