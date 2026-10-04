import { get } from "@/lib/db";
import { syncNow } from "@/lib/events";
import { disconnect, getAccountRow, googleConfigured, redirectUri } from "@/lib/google";
import { json, route } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Bağlantı durumu */
export const GET = route(async () => {
  const row = await getAccountRow();
  const pending = (await get<{ n: number }>("SELECT COUNT(*) AS n FROM events WHERE dirty = 1 AND calendar_id NOT LIKE 'local:%'"))!.n;
  return json({
    configured: googleConfigured(),
    connected: Boolean(row?.refresh_token),
    redirectUri: redirectUri(),
    email: row?.email ?? null,
    name: row?.name ?? null,
    picture: row?.picture ?? null,
    lastSync: row?.last_sync ?? null,
    lastError: row?.last_error ?? null,
    pending,
  });
});

/** Şimdi senkronize et */
export const POST = route(async () => {
  await syncNow();
  return json({ ok: true, lastSync: (await getAccountRow())?.last_sync ?? null });
});

/** Bağlantıyı kes */
export const DELETE = route(async () => {
  await disconnect();
  return json({ ok: true });
});
