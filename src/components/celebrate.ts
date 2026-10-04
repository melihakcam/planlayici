"use client";

import { toast } from "./toast";

const COLORS = ["#2563eb", "#059669", "#ea580c", "#f59e0b", "#8b5cf6", "#ec4899"];

/** Kısa konfeti kutlaması. "Hareketi azalt" açıksa sadece mesaj gösterir. */
export function celebrate(message?: string) {
  if (message) toast(message, "success");
  if (typeof window === "undefined" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const pieces: HTMLElement[] = [];
  for (let i = 0; i < 60; i++) {
    const el = document.createElement("span");
    el.className = "confetti-piece";
    el.style.left = `${Math.random() * 100}vw`;
    el.style.background = COLORS[i % COLORS.length];
    el.style.setProperty("--dx", `${(Math.random() - 0.5) * 30}vw`);
    el.style.setProperty("--rot", `${Math.round(Math.random() * 900 - 450)}deg`);
    el.style.setProperty("--dur", `${1.6 + Math.random() * 1.4}s`);
    el.style.animationDelay = `${Math.random() * 0.25}s`;
    document.body.appendChild(el);
    pieces.push(el);
  }
  setTimeout(() => pieces.forEach((p) => p.remove()), 3500);
}

/** Kazanılan XP'yi kısa bir bildirimle göster. */
export function xpToast(xp: number, what: string) {
  toast(`+${xp} XP · ${what}`, "success");
}
