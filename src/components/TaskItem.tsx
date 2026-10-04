"use client";

import { CalendarClock, Check, Clock, Flag, Layers, Repeat, Star } from "lucide-react";
import { fmtMinutes, fmtTime, relDay, ymd } from "@/lib/client";
import { PRIORITY_COLOR, PRIORITY_LABEL, type Project, type Task } from "@/lib/types";
import { XP } from "@/lib/xp";
import { celebrate, xpToast } from "./celebrate";
import { emitChanged } from "./toast";

export default function TaskItem({
  task,
  project,
  onToggle,
  onClick,
  subCount,
}: {
  task: Task;
  project?: Project;
  onToggle: () => void | Promise<void>;
  onClick?: () => void;
  subCount?: { done: number; total: number };
}) {
  const done = task.status === "done";
  const today = ymd(new Date());
  const overdue = !done && task.due && task.due < today;
  const isTop = task.top_date === today;

  const toggle = async () => {
    if (!done) {
      const xp = XP.task(task.duration_min, task.priority, isTop);
      if (isTop) celebrate(`Günün en önemli işlerinden biri bitti! +${xp} XP`);
      else xpToast(xp, task.title);
    }
    await onToggle();
    emitChanged();
  };

  return (
    <div
      className={`group flex items-start gap-2 rounded-xl px-1 py-1 transition duration-150 hover:bg-black/[0.03] dark:hover:bg-white/[0.04] ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
        aria-label={done ? `"${task.title}" tamamlanmadı olarak işaretle` : `"${task.title}" tamamla`}
        aria-pressed={done}
      >
        <span
          className={`grid h-6 w-6 place-items-center rounded-full border-2 transition duration-150 group-hover:scale-105 ${done ? "animate-pop" : ""}`}
          style={{ borderColor: PRIORITY_COLOR[task.priority], background: done ? PRIORITY_COLOR[task.priority] : undefined }}
        >
          {done && <Check size={14} className="text-white" strokeWidth={3} />}
        </span>
      </button>
      <div className="min-w-0 flex-1 py-2.5">
        <p className={`flex items-center gap-1.5 text-sm font-medium ${done ? "muted line-through" : ""}`}>
          {isTop && !done && <Star size={14} className="shrink-0 text-streak-600" fill="currentColor" aria-label="Günün en önemli işi" />}
          <span className="min-w-0">{task.title}</span>
        </p>
        <div className="muted mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {task.due && (
            <span className={overdue ? "font-semibold text-red-600 dark:text-red-400" : ""}>
              <CalendarClock size={12} className="mr-1 inline" aria-hidden />
              {overdue ? "Gecikti · " : ""}
              {relDay(task.due)}
            </span>
          )}
          {task.event_start && !done && (
            <span className="font-medium text-brand-600 dark:text-brand-500">
              <Clock size={12} className="mr-1 inline" aria-hidden />
              {task.event_all_day ? relDay(task.event_start) : `${relDay(ymd(new Date(task.event_start)))} ${fmtTime(task.event_start)}`}
            </span>
          )}
          <span>{fmtMinutes(task.duration_min)}</span>
          {task.chunk_min ? (
            <span title={`${task.chunk_min} dakikalık parçalara bölünür`}>
              <Layers size={12} className="mr-1 inline" aria-hidden />
              {task.chunk_min} dk parça
            </span>
          ) : null}
          {task.repeat && <Repeat size={12} aria-label="Tekrarlayan" />}
          {task.priority < 4 && (
            <span style={{ color: PRIORITY_COLOR[task.priority] }} className="font-medium">
              <Flag size={12} className="mr-0.5 inline" aria-hidden />
              {PRIORITY_LABEL[task.priority]}
            </span>
          )}
          {subCount && subCount.total > 0 && (
            <span>
              {subCount.done}/{subCount.total} alt görev
            </span>
          )}
          {project && (
            <span className="chip" style={{ background: `${project.color}1f`, color: project.color }}>
              {project.name}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
