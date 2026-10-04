"use client";

import { CalendarClock, Check, Clock, Flag, Repeat } from "lucide-react";
import { fmtMinutes, fmtTime, relDay, ymd } from "@/lib/client";
import { PRIORITY_COLOR, type Project, type Task } from "@/lib/types";

export default function TaskItem({
  task,
  project,
  onToggle,
  onClick,
  subCount,
}: {
  task: Task;
  project?: Project;
  onToggle: () => void;
  onClick?: () => void;
  subCount?: { done: number; total: number };
}) {
  const done = task.status === "done";
  const overdue = !done && task.due && task.due < ymd(new Date());
  return (
    <div
      className={`group flex items-start gap-3 rounded-xl px-2 py-2 transition hover:bg-black/[0.03] dark:hover:bg-white/[0.04] ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition hover:scale-110"
        style={{ borderColor: PRIORITY_COLOR[task.priority], background: done ? PRIORITY_COLOR[task.priority] : undefined }}
        aria-label={done ? "Tamamlanmadı olarak işaretle" : "Tamamla"}
      >
        {done && <Check size={12} className="text-white" strokeWidth={3} />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${done ? "muted line-through" : ""}`}>{task.title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs muted">
          {task.due && (
            <span className={overdue ? "font-medium text-red-600" : ""}>
              <CalendarClock size={12} className="mr-1 inline" />
              {relDay(task.due)}
            </span>
          )}
          {task.event_start && !done && (
            <span className="text-brand-600 dark:text-brand-100">
              <Clock size={12} className="mr-1 inline" />
              {task.event_all_day ? relDay(task.event_start) : `${relDay(ymd(new Date(task.event_start)))} ${fmtTime(task.event_start)}`}
            </span>
          )}
          <span>{fmtMinutes(task.duration_min)}</span>
          {task.repeat && <Repeat size={12} />}
          {task.priority < 4 && <Flag size={12} style={{ color: PRIORITY_COLOR[task.priority] }} />}
          {subCount && subCount.total > 0 && (
            <span>
              {subCount.done}/{subCount.total} alt görev
            </span>
          )}
          {project && (
            <span className="chip" style={{ background: `${project.color}22`, color: project.color }}>
              {project.name}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
