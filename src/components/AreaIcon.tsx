import { Briefcase, Code2, GraduationCap, House } from "lucide-react";
import type { Area } from "@/lib/types";

const ICONS = { yazilim: Code2, is: Briefcase, okul: GraduationCap, kisisel: House } as const;

/** Proje alanı ikonu (emoji yerine SVG — tasarım sistemi kuralı) */
export default function AreaIcon({ area, size = 14, className }: { area: Area; size?: number; className?: string }) {
  const Icon = ICONS[area] ?? House;
  return <Icon size={size} className={className} aria-hidden />;
}
