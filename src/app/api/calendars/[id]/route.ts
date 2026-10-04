import { getCalendar, listCalendars, setCalendarSelected } from "@/lib/calendars";
import { syncNow } from "@/lib/events";
import { body, json, route, type IdCtx } from "@/lib/http";

/** { selected } — takvimi senkrona dahil eder ya da çıkarır. */
export const PATCH = route<IdCtx>(async (req, { params }) => {
  const id = decodeURIComponent((await params).id);
  if (!(await getCalendar(id))) return json({ error: "Takvim bulunamadı" }, 404);
  const b = await body<{ selected?: boolean }>(req);
  if (b.selected !== undefined) {
    await setCalendarSelected(id, b.selected);
    if (b.selected) await syncNow().catch(() => {});
  }
  return json(await listCalendars());
});
