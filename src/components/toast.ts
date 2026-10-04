"use client";

export type ToastKind = "info" | "success" | "error";

export function toast(message: string, kind: ToastKind = "info") {
  window.dispatchEvent(new CustomEvent("planlayici:toast", { detail: { message, kind } }));
}

/** Veriler değiştiğinde (ör. senkron sonrası) sayfaların yenilenmesi için. */
export function emitChanged() {
  window.dispatchEvent(new Event("planlayici:changed"));
}

export function onChanged(cb: () => void) {
  window.addEventListener("planlayici:changed", cb);
  return () => window.removeEventListener("planlayici:changed", cb);
}
