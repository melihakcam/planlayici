import { all, get, nowIso, run, ymd } from "@/lib/db";
import { body, json, route } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const date = new URL(req.url).searchParams.get("date");
  if (date) {
    return json((await get("SELECT * FROM journal WHERE date = ?", [date])) ?? { date, content: "", mood: null });
  }
  return json(
    await all("SELECT date, mood, substr(content, 1, 140) AS content FROM journal WHERE date NOT LIKE 'hafta-%' ORDER BY date DESC LIMIT 60"),
  );
});

export const PUT = route(async (req) => {
  const b = await body<{ date?: string; content?: string; mood?: number | null }>(req);
  const date = b.date || ymd(new Date());
  await run(
    `INSERT INTO journal (date, content, mood, updated_at) VALUES (@date, @content, @mood, @ts)
     ON CONFLICT(user_id, date) DO UPDATE SET content = @content, mood = @mood, updated_at = @ts`,
    { date, content: b.content ?? "", mood: b.mood ?? null, ts: nowIso() },
  );
  return json({ ok: true });
});
