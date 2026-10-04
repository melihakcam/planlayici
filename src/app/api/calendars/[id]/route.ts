import { deleteLocalCalendar, getCalendar, listCalendars, setCalendarSelected, updateLocalCalendar } from "@/lib/calendars";
import { syncNow } from "@/lib/events";
import { body, json, route, type IdCtx } from "@/lib/http";
import { getSettings, saveSettings } from "@/lib/settings";

/** { selected } senkrona dahil et/çıkar · { summary, color } yerel takvimi düzenle */
export const PATCH = route<IdCtx>(async (req, { params }) => {
  const id = decodeURIComponent((await params).id);
  if (!(await getCalendar(id))) return json({ error: "Takvim bulunamadı" }, 404);
  const b = await body<{ selected?: boolean; summary?: string; color?: string }>(req);
  if (b.summary !== undefined || b.color !== undefined) await updateLocalCalendar(id, b);
  if (b.selected !== undefined) {
    await setCalendarSelected(id, b.selected);
    if (b.selected && !id.startsWith("local:")) await syncNow().catch(() => {});
  }
  return json(await listCalendars());
});

/** Yerel takvimi ve etkinliklerini sil */
export const DELETE = route<IdCtx>(async (_req, { params }) => {
  const id = decodeURIComponent((await params).id);
  await deleteLocalCalendar(id);
  // Varsayılan takvim silindiyse "Kişisel Plan"a dön.
  if ((await getSettings()).planCalendarId === id) await saveSettings({ planCalendarId: "local:plan" });
  return json(await listCalendars());
});
