import { listCalendars } from "@/lib/calendars";
import { json, route } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = route(async () => json(await listCalendars()));
