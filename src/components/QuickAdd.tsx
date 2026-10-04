"use client";

import { CalendarClock, Flag, Plus, Repeat, Timer } from "lucide-react";
import { useState } from "react";
import { api, relDay } from "@/lib/client";
import { parseTask } from "@/lib/parse";
import { PRIORITY_LABEL, type Project, type Task } from "@/lib/types";
import { toast } from "./toast";

/** Doğal dil ile görev ekleme: "Rapor yaz yarın 45dk !1 #iş" */
export default function QuickAdd({
  projects,
  defaults,
  onAdded,
  placeholder = "Görev ekle… (ör. Rapor yaz yarın 45dk !1 #iş)",
  autoFocus,
}: {
  projects: Project[];
  defaults?: { due?: string | null; project_id?: string | null; planned_date?: string | null };
  onAdded: (task: Task) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState("");
  const p = text.trim() ? parseTask(text) : null;
  const project = p?.project ? projects.find((x) => x.name.toLocaleLowerCase("tr") === p.project!.toLocaleLowerCase("tr")) : null;

  const submit = async () => {
    if (!p?.title) return;
    try {
      let projectId = project?.id ?? defaults?.project_id ?? null;
      if (p.project && !project) {
        const created = await api<Project>("/api/projects", { body: { name: p.project, color: "#6366f1" } });
        projectId = created.id;
      }
      const task = await api<Task>("/api/tasks", {
        body: {
          title: p.title,
          due: p.due ?? defaults?.due ?? null,
          priority: p.priority ?? 4,
          duration_min: p.duration ?? 30,
          project_id: projectId,
          repeat: p.repeat,
          planned_date: defaults?.planned_date ?? null,
        },
      });
      setText("");
      onAdded(task);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <div>
      <div className="flex gap-2">
        <input
          autoFocus={autoFocus}
          className="input"
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <button className="btn-primary shrink-0" onClick={submit} disabled={!p?.title} aria-label="Ekle">
          <Plus size={16} />
        </button>
      </div>
      {p && (p.due || p.priority || p.duration || p.project || p.repeat) && (
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          {p.due && <span className="chip bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-100"><CalendarClock size={12} aria-hidden /> {relDay(p.due)}</span>}
          {p.duration && <span className="chip bg-gray-100 dark:bg-white/10"><Timer size={12} aria-hidden /> {p.duration} dk</span>}
          {p.priority && <span className="chip bg-red-50 text-red-700 dark:bg-red-500/15"><Flag size={12} aria-hidden /> {PRIORITY_LABEL[p.priority]}</span>}
          {p.project && <span className="chip bg-gray-100 dark:bg-white/10"># {p.project}{!project && " (yeni)"}</span>}
          {p.repeat && (
            <span className="chip bg-gray-100 dark:bg-white/10">
              <Repeat size={12} aria-hidden /> {{ daily: "Her gün", weekly: "Her hafta", monthly: "Her ay" }[p.repeat]}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
