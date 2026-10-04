import { generateSchedule } from "@/lib/courses";
import { json, route } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Dersleri dönem boyunca okul takvimine işler (sınav haftaları hariç). */
export const POST = route(async () => json(await generateSchedule()));
