import { all, nowIso, run, uid } from "@/lib/db";
import { body, json, route } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const days = Number(new URL(req.url).searchParams.get("days")) || 1;
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (days - 1));
  return json(
    await all(
      `SELECT f.*, t.title AS task_title FROM focus_sessions f LEFT JOIN tasks t ON t.id = f.task_id
       WHERE f.abandoned = 0 AND f.started_at >= ? ORDER BY f.started_at DESC`,
      [since.toISOString()],
    ),
  );
});

export const POST = route(async (req) => {
  const b = await body<{ taskId?: string | null; minutes?: number; startedAt?: string; abandoned?: boolean }>(req);
  const minutes = Math.round(Number(b.minutes) || 0);
  if (minutes <= 0) return json({ error: "Süre geçersiz" }, 400);
  await run("INSERT INTO focus_sessions (id, task_id, started_at, minutes, abandoned) VALUES (?, ?, ?, ?, ?)", [
    uid(),
    b.taskId || null,
    b.startedAt || nowIso(),
    minutes,
    b.abandoned ? 1 : 0,
  ]);
  return json({ ok: true }, 201);
});
