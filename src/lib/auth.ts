export const AUTH_COOKIE = "planlayici_oturum";

/** Şifreden türetilen oturum anahtarı (şifre değişirse tüm oturumlar düşer). Edge ve Node'da çalışır. */
export async function authToken(password: string) {
  const data = new TextEncoder().encode(`planlayici-oturum:${password}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}
