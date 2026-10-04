"use client";

import { MapPin, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { addDays, api, parseYmd, toLocalInput, useApi, ymd } from "@/lib/client";
import { GOOGLE_COLORS, type CalendarRow, type EventRow } from "@/lib/types";
import Modal from "./Modal";
import { toast } from "./toast";

export type EventDraft = { start: Date; end: Date; allDay: boolean; title?: string };

const REMINDERS = [
  { v: "", l: "Varsayılan" },
  { v: "0", l: "Başlarken" },
  { v: "5", l: "5 dk önce" },
  { v: "10", l: "10 dk önce" },
  { v: "15", l: "15 dk önce" },
  { v: "30", l: "30 dk önce" },
  { v: "60", l: "1 saat önce" },
  { v: "1440", l: "1 gün önce" },
];

export default function EventModal({
  open,
  onClose,
  event,
  draft,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  event?: EventRow | null;
  draft?: EventDraft | null;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [colorId, setColorId] = useState<string | null>(null);
  const [reminder, setReminder] = useState("");
  const [repeat, setRepeat] = useState("");
  const [repeatCount, setRepeatCount] = useState("");
  const [busy, setBusy] = useState(false);
  const [calendarId, setCalendarId] = useState("primary");
  const calendars = useApi<CalendarRow[]>(open ? "/api/calendars" : null);
  const settings = useApi<{ planCalendarId: string }>(open ? "/api/settings" : null);

  useEffect(() => {
    if (!open) return;
    const usable = (calendars.data ?? []).filter((c) => c.selected && c.access_role !== "reader");
    const preferred = settings.data?.planCalendarId ?? "primary";
    setCalendarId(
      event?.calendar_id ?? (usable.some((c) => c.id === preferred) || !usable.length ? preferred : usable[0].id),
    );
  }, [open, event, settings.data, calendars.data]);

  useEffect(() => {
    if (!open) return;
    if (event) {
      const ad = Boolean(event.all_day);
      setTitle(event.title);
      setAllDay(ad);
      setStart(ad ? event.start : toLocalInput(new Date(event.start)));
      // Tüm gün etkinliklerde bitiş hariç tutulur; formda dahil olarak gösterilir.
      setEnd(ad ? ymd(addDays(parseYmd(event.end), -1)) : toLocalInput(new Date(event.end)));
      setLocation(event.location);
      setDescription(event.description);
      setColorId(event.color_id);
      setReminder(event.reminder_min == null ? "" : String(event.reminder_min));
    } else if (draft) {
      setTitle(draft.title ?? "");
      setAllDay(draft.allDay);
      setStart(draft.allDay ? ymd(draft.start) : toLocalInput(draft.start));
      setEnd(draft.allDay ? ymd(addDays(draft.end, -1)) : toLocalInput(draft.end));
      setLocation("");
      setDescription("");
      setColorId(null);
      setReminder("");
    }
    setRepeat("");
    setRepeatCount("");
  }, [open, event, draft]);

  const switchAllDay = (v: boolean) => {
    setAllDay(v);
    if (v) {
      setStart(start.slice(0, 10));
      setEnd((end || start).slice(0, 10));
    } else {
      const d = start.slice(0, 10);
      setStart(`${d}T09:00`);
      setEnd(`${d}T10:00`);
    }
  };

  const save = async () => {
    if (!start) return toast("Başlangıç zamanı seçin", "error");
    setBusy(true);
    try {
      const payload = {
        title,
        allDay,
        start: allDay ? start : new Date(start).toISOString(),
        end: allDay ? ymd(addDays(parseYmd(end || start), 1)) : new Date(end || start).toISOString(),
        location,
        description,
        colorId,
        reminderMin: reminder === "" ? null : Number(reminder),
        ...(calendarList.length ? { calendarId } : {}),
        ...(event ? {} : { repeat: repeat || null, repeatCount: repeatCount ? Number(repeatCount) : null }),
      };
      if (event) await api(`/api/events/${event.id}`, { method: "PATCH", body: payload });
      else await api("/api/events", { body: payload });
      toast(event ? "Etkinlik güncellendi" : "Etkinlik eklendi", "success");
      onSaved();
      onClose();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (series: boolean) => {
    if (!event) return;
    setBusy(true);
    try {
      await api(`/api/events/${event.id}${series ? "?series=1" : ""}`, { method: "DELETE" });
      toast(series ? "Seri silindi" : "Etkinlik silindi", "success");
      onSaved();
      onClose();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const isSeries = Boolean(event?.recurring_event_id || event?.series_id);
  const allCals = calendars.data ?? [];
  const readOnly = Boolean(event && allCals.find((c) => c.id === event.calendar_id)?.access_role === "reader");
  // Seçilebilir takvimler: senkrona dahil ve yazılabilir olanlar (+ etkinliğin şu anki takvimi)
  const calendarList = allCals.filter(
    (c) => (c.selected && c.access_role !== "reader") || c.id === event?.calendar_id,
  );

  return (
    <Modal open={open} onClose={onClose} title={event ? "Etkinliği düzenle" : "Yeni etkinlik"}>
      <div className="space-y-3">
        <input
          autoFocus
          className="input text-base font-medium"
          placeholder="Başlık"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={allDay} onChange={(e) => switchAllDay(e.target.checked)} />
          Tüm gün
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <span className="label">Başlangıç</span>
            <input
              type={allDay ? "date" : "datetime-local"}
              className="input"
              value={start}
              onChange={(e) => {
                const v = e.target.value;
                // Bitişi aynı süreyle kaydır
                if (start && end && v) {
                  const diff = (allDay ? parseYmd(end).getTime() - parseYmd(start).getTime() : new Date(end).getTime() - new Date(start).getTime());
                  const ne = allDay ? ymd(new Date(parseYmd(v).getTime() + diff)) : toLocalInput(new Date(new Date(v).getTime() + diff));
                  setEnd(ne);
                }
                setStart(v);
              }}
            />
          </div>
          <div>
            <span className="label">Bitiş</span>
            <input type={allDay ? "date" : "datetime-local"} className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div className="relative">
          <MapPin size={16} className="muted absolute left-3 top-2.5" />
          <input className="input pl-9" placeholder="Konum" value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
        <textarea
          className="input min-h-20"
          placeholder="Açıklama"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div>
          <span className="label">Renk</span>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setColorId(null)}
              className={`h-7 w-7 rounded-full bg-brand-600 ring-offset-2 ${colorId === null ? "ring-2 ring-brand-500" : ""}`}
              title="Varsayılan"
            />
            {Object.entries(GOOGLE_COLORS).map(([id, c]) => (
              <button
                key={id}
                onClick={() => setColorId(id)}
                className={`h-7 w-7 rounded-full ring-offset-2 ${colorId === id ? "ring-2 ring-brand-500" : ""}`}
                style={{ background: c.hex }}
                title={c.name}
              />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <span className="label">Hatırlatıcı</span>
            <select className="input" value={reminder} onChange={(e) => setReminder(e.target.value)}>
              {REMINDERS.map((r) => (
                <option key={r.v} value={r.v}>
                  {r.l}
                </option>
              ))}
            </select>
          </div>
          {!event && (
            <div>
              <span className="label">Tekrar</span>
              <div className="flex gap-2">
                <select className="input" value={repeat} onChange={(e) => setRepeat(e.target.value)}>
                  <option value="">Tekrarlanmaz</option>
                  <option value="daily">Her gün</option>
                  <option value="weekly">Her hafta</option>
                  <option value="monthly">Her ay</option>
                  <option value="yearly">Her yıl</option>
                </select>
                {repeat && (
                  <input
                    type="number"
                    min={1}
                    className="input w-24"
                    placeholder="Kez"
                    title="Kaç kez tekrarlansın (boş = süresiz)"
                    value={repeatCount}
                    onChange={(e) => setRepeatCount(e.target.value)}
                  />
                )}
              </div>
            </div>
          )}
        </div>
        {calendarList.length > 0 && (
          <div>
            <span className="label">Takvim</span>
            <select
              className="input"
              value={calendarId}
              disabled={readOnly || (isSeries && Boolean(event))}
              title={isSeries && event ? "Tekrarlayan etkinlikler başka takvime taşınamaz" : undefined}
              onChange={(e) => setCalendarId(e.target.value)}
            >
              {calendarList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.summary}
                </option>
              ))}
            </select>
          </div>
        )}
        {readOnly && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
            Bu etkinlik salt okunur bir takvimde; değiştirilemez.
          </p>
        )}
        {event?.google_id && !readOnly && <p className="muted text-xs">Bu etkinlik Google Takvim ile senkronize.</p>}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <div className="flex gap-1">
            {event && !readOnly && (
              <button className="btn-danger" disabled={busy} onClick={() => remove(false)}>
                <Trash2 size={16} /> {isSeries ? "Bunu sil" : "Sil"}
              </button>
            )}
            {event && isSeries && !readOnly && (
              <button className="btn-danger" disabled={busy} onClick={() => remove(true)}>
                Tüm seriyi sil
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={onClose}>
              Vazgeç
            </button>
            {!readOnly && (
              <button className="btn-primary" disabled={busy} onClick={save}>
                Kaydet
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
