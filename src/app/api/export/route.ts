import { all } from "@/lib/db";
import { route } from "@/lib/http";

export const dynamic = "force-dynamic";

const TABLES = ["settings", "projects", "tasks", "events", "habits", "habit_logs", "focus_sessions", "journal"];

/** Tüm verileri JSON olarak indirir (Google erişim anahtarları hariç). */
export const GET = route(async () => {
  const data = Object.fromEntries(await Promise.all(TABLES.map(async (t) => [t, await all(`SELECT * FROM ${t}`)])));
  return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), ...data }, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="planlayici-yedek-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
});
