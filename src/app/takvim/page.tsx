"use client";

import dynamic from "next/dynamic";

const CalendarView = dynamic(() => import("@/components/CalendarView"), {
  ssr: false,
  loading: () => <div className="muted p-8 text-sm">Takvim yükleniyor…</div>,
});

export default function CalendarPage() {
  return <CalendarView />;
}
