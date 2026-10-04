import { json, route } from "@/lib/http";
import { getProgress } from "@/lib/progress";

export const dynamic = "force-dynamic";

/** XP, seviye, seri ve günlük hedef */
export const GET = route(async () => json(await getProgress()));
