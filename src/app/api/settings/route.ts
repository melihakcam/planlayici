import { body, json, route } from "@/lib/http";
import { getSettings, saveSettings, type Settings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export const GET = route(async () => json(await getSettings()));
export const PUT = route(async (req) => json(await saveSettings(await body<Partial<Settings>>(req))));
