import { createHabit, listHabits } from "@/lib/habits";
import { body, json, route } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => json(await listHabits(new URL(req.url).searchParams.get("all") === "1")));

export const POST = route(async (req) => {
  await createHabit(await body(req));
  return json(await listHabits(), 201);
});
