import { addDays, ymd } from "./client";

export type ParsedTask = {
  title: string;
  due: string | null;
  priority: number | null;
  duration: number | null;
  project: string | null;
  repeat: "daily" | "weekly" | "monthly" | null;
};

const WEEKDAYS: Record<string, number> = {
  pazar: 0,
  pazartesi: 1,
  salı: 2,
  sali: 2,
  çarşamba: 3,
  carsamba: 3,
  perşembe: 4,
  persembe: 4,
  cuma: 5,
  cumartesi: 6,
};

/**
 * Hızlı görev ekleme ayrıştırıcısı.
 * Örnek: "Rapor yaz yarın 45dk !1 #iş", "Spor her gün 1s", "Fatura öde 15.10"
 */
export function parseTask(input: string, now = new Date()): ParsedTask {
  let text = ` ${input} `;
  const out: ParsedTask = { title: "", due: null, priority: null, duration: null, project: null, repeat: null };
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void) => {
    const m = text.match(re);
    if (m) {
      fn(m);
      text = text.replace(m[0], " ");
    }
  };

  take(/\s(?:!|p)([1-4])(?=\s)/i, (m) => (out.priority = Number(m[1])));
  take(/\s#([\p{L}\p{N}_-]+)(?=\s)/u, (m) => (out.project = m[1]));
  take(/\sher\s+(gün|hafta|ay)(?=\s)/i, (m) => {
    out.repeat = ({ gün: "daily", hafta: "weekly", ay: "monthly" } as const)[m[1].toLowerCase() as "gün" | "hafta" | "ay"];
  });
  take(/\s(\d+(?:[.,]\d+)?)\s?(dk|dakika|s|sa|saat)(?=\s)/i, (m) => {
    const n = Number(m[1].replace(",", "."));
    out.duration = Math.round(m[2].toLowerCase().startsWith("d") ? n : n * 60);
  });
  take(/\s(bugün|bugun)(?=\s)/i, () => (out.due = ymd(now)));
  take(/\s(yarın|yarin)(?=\s)/i, () => (out.due = ymd(addDays(now, 1))));
  take(/\s(öbür gün|obur gun|ertesi gün)(?=\s)/i, () => (out.due = ymd(addDays(now, 2))));
  take(/\s(haftaya)(?=\s)/i, () => (out.due = ymd(addDays(now, 7))));
  take(/\s(pazartesi|salı|sali|çarşamba|carsamba|perşembe|persembe|cumartesi|cuma|pazar)(?=\s)/i, (m) => {
    const target = WEEKDAYS[m[1].toLowerCase()];
    let diff = (target - now.getDay() + 7) % 7;
    if (diff === 0) diff = 7;
    out.due = ymd(addDays(now, diff));
  });
  take(/\s(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?=\s)/, (m) => {
    const d = Number(m[1]);
    const mo = Number(m[2]) - 1;
    let y = m[3] ? Number(m[3]) : now.getFullYear();
    if (y < 100) y += 2000;
    const date = new Date(y, mo, d);
    if (!m[3] && date < new Date(now.getFullYear(), now.getMonth(), now.getDate())) date.setFullYear(y + 1);
    if (!isNaN(date.getTime())) out.due = ymd(date);
  });

  out.title = text.replace(/\s+/g, " ").trim();
  return out;
}
