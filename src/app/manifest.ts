import type { MetadataRoute } from "next";

/** Telefona "ana ekrana ekle" ile uygulama gibi kurulum (PWA) */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Planlayıcı",
    short_name: "Planlayıcı",
    description: "Günün planı, odak ve projeler tek yerde",
    lang: "tr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8fafc",
    theme_color: "#2563eb",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Günü planla", url: "/planla" },
      { name: "Odak", url: "/odak" },
      { name: "Görevler", url: "/gorevler" },
    ],
  };
}
