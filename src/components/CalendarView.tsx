"use client";

import type { EventDropArg, EventInput } from "@fullcalendar/core";
import trLocale from "@fullcalendar/core/locales/tr";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, { Draggable, type EventResizeDoneArg } from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import { GripVertical, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import EventModal, { type EventDraft } from "@/components/EventModal";
import { onChanged, toast } from "@/components/toast";
import { addDays, api, fmtMinutes, useApi, ymd } from "@/lib/client";
import { eventColor, PRIORITY_COLOR, PRIORITY_GOOGLE_COLOR, type CalendarRow, type EventRow, type Task } from "@/lib/types";

function toFc(e: EventRow): EventInput {
  const color = eventColor(e);
  return {
    id: e.id,
    title: `${e.recurring_event_id || e.series_id ? "🔁 " : ""}${e.task_id ? "✓ " : ""}${e.title}`,
    start: e.start,
    end: e.end,
    allDay: Boolean(e.all_day),
    backgroundColor: color,
    borderColor: color,
    editable: e.writable !== 0,
    extendedProps: { row: e },
  };
}

const HIDDEN_KEY = "planlayici:hiddenCalendars";

function loadHidden(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

export default function CalendarView() {
  const cal = useRef<FullCalendar>(null);
  const taskBox = useRef<HTMLDivElement>(null);
  const settings = useApi<{ weekStart: number; workStart: string; workEnd: string }>("/api/settings");
  const tasks = useApi<Task[]>("/api/tasks");
  const [modal, setModal] = useState<{ event?: EventRow | null; draft?: EventDraft | null } | null>(null);
  const [planning, setPlanning] = useState(false);
  const [mobile, setMobile] = useState(false);
  const calendars = useApi<CalendarRow[]>("/api/calendars");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;

  useEffect(() => {
    setMobile(window.innerWidth < 768);
    setHidden(loadHidden());
  }, []);

  const toggleVisible = (id: string) => {
    const next = new Set(hidden);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setHidden(next);
    hiddenRef.current = next;
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify([...next]));
    } catch {}
    cal.current?.getApi().refetchEvents();
  };
  const visibleCals = (calendars.data ?? []).filter((c) => c.selected);

  const refetch = () => {
    cal.current?.getApi().refetchEvents();
    tasks.reload();
    calendars.reload();
  };
  useEffect(() => onChanged(refetch));

  // Planlanmamış görevler takvime sürüklenebilir
  useEffect(() => {
    if (!taskBox.current) return;
    const d = new Draggable(taskBox.current, {
      itemSelector: ".fc-task",
      eventData: (el) => ({
        title: el.dataset.title,
        duration: { minutes: Number(el.dataset.duration) || 30 },
        create: false,
      }),
    });
    return () => d.destroy();
  }, [settings.data]);

  const unscheduled = (tasks.data ?? []).filter((t) => t.status === "todo" && !t.event_id && !t.parent_id);

  const move = async (info: EventDropArg | EventResizeDoneArg) => {
    const ev = info.event;
    const allDay = ev.allDay;
    const start = allDay ? ymd(ev.start!) : ev.start!.toISOString();
    const end = allDay
      ? ymd(ev.end ?? addDays(ev.start!, 1))
      : (ev.end ?? new Date(ev.start!.getTime() + 3_600_000)).toISOString();
    try {
      await api(`/api/events/${ev.id}`, { method: "PATCH", body: { start, end, allDay } });
    } catch (e) {
      info.revert();
      toast((e as Error).message, "error");
    }
  };

  const plan = async () => {
    setPlanning(true);
    try {
      const r = await api<{ planned: unknown[]; unplanned: unknown[] }>("/api/schedule", { body: {} });
      toast(`${r.planned.length} görev planlandı${r.unplanned.length ? `, ${r.unplanned.length} görev sığmadı` : ""}`, "success");
      refetch();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setPlanning(false);
    }
  };

  if (!settings.data) return <div className="muted p-8 text-sm">Yükleniyor…</div>;

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="card min-w-0 flex-1 p-2 sm:p-4">
        <FullCalendar
          ref={cal}
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          locale={trLocale}
          firstDay={settings.data.weekStart}
          initialView={mobile ? "timeGridDay" : "timeGridWeek"}
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: mobile ? "timeGridDay,listWeek,dayGridMonth" : "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
          }}
          height={mobile ? "calc(100dvh - 12rem)" : "calc(100vh - 7rem)"}
          nowIndicator
          editable
          droppable
          selectable
          selectMirror
          dayMaxEvents
          scrollTime="07:00:00"
          businessHours={{ startTime: settings.data.workStart, endTime: settings.data.workEnd, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] }}
          slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
          eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
          events={async (info: { start: Date; end: Date }) =>
            (await api<EventRow[]>(`/api/events?start=${info.start.toISOString()}&end=${info.end.toISOString()}`))
              .filter((e) => !hiddenRef.current.has(e.calendar_id))
              .map(toFc)
          }
          select={(info) => {
            setModal({ draft: { start: info.start, end: info.end, allDay: info.allDay } });
            info.view.calendar.unselect();
          }}
          eventClick={(info) => setModal({ event: info.event.extendedProps.row as EventRow })}
          eventDrop={move}
          eventResize={move}
          drop={async (info) => {
            const el = info.draggedEl as HTMLElement;
            const minutes = Number(el.dataset.duration) || 30;
            const start = info.date;
            try {
              await api("/api/events", {
                body: {
                  title: el.dataset.title,
                  allDay: info.allDay,
                  start: info.allDay ? ymd(start) : start.toISOString(),
                  end: info.allDay ? ymd(addDays(start, 1)) : new Date(start.getTime() + minutes * 60_000).toISOString(),
                  taskId: el.dataset.id,
                  colorId: PRIORITY_GOOGLE_COLOR[Number(el.dataset.priority)] ?? null,
                },
              });
              refetch();
            } catch (e) {
              toast((e as Error).message, "error");
            }
          }}
        />
      </div>

      <aside className="card w-full shrink-0 lg:w-72">
        {visibleCals.length > 1 && (
          <div className="mb-4 border-b border-theme pb-4">
            <h2 className="mb-2 font-semibold">Takvimler</h2>
            <ul className="space-y-0.5">
              {visibleCals.map((c) => (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1 text-sm hover:bg-black/5 dark:hover:bg-white/5">
                    <input
                      type="checkbox"
                      checked={!hidden.has(c.id)}
                      onChange={() => toggleVisible(c.id)}
                      style={{ accentColor: c.color }}
                    />
                    <span className="min-w-0 flex-1 truncate">{c.summary}</span>
                    {c.access_role === "reader" && <span className="muted text-[10px]">salt okunur</span>}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Planlanmamış görevler</h2>
          <span className="muted text-xs">{unscheduled.length}</span>
        </div>
        <p className="muted mb-3 text-xs">Görevleri takvime sürükleyin ya da otomatik yerleştirin.</p>
        <button className="btn-primary mb-3 w-full" onClick={plan} disabled={planning || unscheduled.length === 0}>
          <Sparkles size={16} /> {planning ? "Planlanıyor…" : "Akıllı planla"}
        </button>
        <div ref={taskBox} className="max-h-[60vh] space-y-2 overflow-y-auto">
          {unscheduled.length === 0 && <p className="muted py-4 text-center text-sm">Hepsi planlandı 🎉</p>}
          {unscheduled.map((t) => (
            <div
              key={t.id}
              className="fc-task flex cursor-grab items-center gap-2 rounded-lg border border-theme p-2 text-sm active:cursor-grabbing"
              data-id={t.id}
              data-title={t.title}
              data-duration={t.duration_min}
              data-priority={t.priority}
              style={{ borderLeft: `4px solid ${PRIORITY_COLOR[t.priority]}` }}
            >
              <GripVertical size={14} className="muted shrink-0" />
              <span className="min-w-0 flex-1 truncate">{t.title}</span>
              <span className="muted shrink-0 text-xs">{fmtMinutes(t.duration_min)}</span>
            </div>
          ))}
        </div>
      </aside>

      <EventModal open={!!modal} onClose={() => setModal(null)} event={modal?.event} draft={modal?.draft} onSaved={refetch} />
    </div>
  );
}
