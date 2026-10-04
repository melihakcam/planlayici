import { batch, get, OWNER, run } from "./db";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
export const CAL_API = "https://www.googleapis.com/calendar/v3";
const SCOPES = ["openid", "email", "profile", "https://www.googleapis.com/auth/calendar"];

export type GoogleAccount = {
  email: string | null;
  name: string | null;
  picture: string | null;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
  last_sync: string | null;
  last_error: string | null;
};

export class GoogleError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const googleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export const appUrl = () => (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
export const redirectUri = () => `${appUrl()}/api/google/callback`;

export function authUrl(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${params}`;
}

/** Ham satır (yenileme anahtarı olmasa da) — durum ekranı için. */
export async function getAccountRow(): Promise<GoogleAccount | null> {
  return (await get<GoogleAccount>("SELECT * FROM google_account WHERE user_id = ?", [OWNER])) ?? null;
}

/** Yalnızca kullanılabilir (yenileme anahtarı olan) bağlantı. */
export async function getAccount(): Promise<GoogleAccount | null> {
  const row = await getAccountRow();
  return row && row.refresh_token ? row : null;
}

export async function setAccountField(fields: Partial<GoogleAccount>) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  await run(`UPDATE google_account SET ${keys.map((k) => `${k} = @${k}`).join(", ")} WHERE user_id = @uid`, {
    ...fields,
    uid: OWNER,
  });
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      ...body,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new GoogleError(res.status, json.error_description || json.error || "Token hatası");
  return json as { access_token: string; expires_in: number; refresh_token?: string; scope?: string };
}

export async function connectWithCode(code: string) {
  const tok = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri() });
  // Google izin ekranında izinler tek tek seçilebiliyor; takvim izni verilmediyse bağlantıyı kaydetme.
  if (tok.scope && !tok.scope.includes("auth/calendar")) throw new GoogleError(403, "takvim-izni-yok");
  const info = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${tok.access_token}` } }).then((r) =>
    r.json(),
  );
  const prev = await getAccountRow();
  const refresh = tok.refresh_token || prev?.refresh_token;
  if (!refresh) throw new GoogleError(400, "Google yenileme anahtarı vermedi. Tekrar bağlanmayı deneyin.");
  await run(
    `INSERT INTO google_account (user_id, email, name, picture, access_token, refresh_token, expires_at, last_error)
     VALUES (@uid, @email, @name, @picture, @access, @refresh, @exp, NULL)
     ON CONFLICT(user_id) DO UPDATE SET email=@email, name=@name, picture=@picture, access_token=@access,
       refresh_token=@refresh, expires_at=@exp, last_error=NULL`,
    {
      uid: OWNER,
      email: info.email ?? null,
      name: info.name ?? null,
      picture: info.picture ?? null,
      access: tok.access_token,
      refresh,
      exp: Date.now() + tok.expires_in * 1000,
    },
  );
  return { email: info.email as string | undefined };
}

export async function accessToken(): Promise<string | null> {
  const acc = await getAccount();
  if (!acc || !googleConfigured()) return null;
  if (acc.access_token && acc.expires_at && acc.expires_at > Date.now() + 60_000) return acc.access_token;
  try {
    const tok = await tokenRequest({ refresh_token: acc.refresh_token!, grant_type: "refresh_token" });
    await setAccountField({ access_token: tok.access_token, expires_at: Date.now() + tok.expires_in * 1000 });
    return tok.access_token;
  } catch (e) {
    if (e instanceof GoogleError && e.status === 400) {
      // Yenileme anahtarı iptal edilmiş ya da süresi dolmuş: kullanıcının yeniden bağlanması gerekir.
      await setAccountField({
        refresh_token: null,
        access_token: null,
        last_error: "Google oturumu sona erdi, lütfen yeniden bağlanın.",
      });
      return null;
    }
    throw e;
  }
}

export async function gfetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken();
  if (!token) throw new GoogleError(401, "Google bağlı değil");
  const res = await fetch(path.startsWith("http") ? path : `${CAL_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const json = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new GoogleError(res.status, json?.error?.message || `Google API hatası (${res.status})`);
  return json as T;
}

export async function disconnect() {
  const acc = await getAccountRow();
  if (acc?.refresh_token) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(acc.refresh_token)}`, {
      method: "POST",
    }).catch(() => {});
  }
  // Google'dan gelen etkinlikler artık senkronlanamayacağı için yerelden kaldırılır.
  await batch([
    { sql: "DELETE FROM google_account WHERE user_id = ?", args: [OWNER] },
    {
      sql: "UPDATE tasks SET event_id = NULL WHERE event_id IN (SELECT id FROM events WHERE google_id IS NOT NULL)",
    },
    { sql: "DELETE FROM events WHERE google_id IS NOT NULL" },
    { sql: "DELETE FROM calendars WHERE id NOT LIKE 'local:%'" },
  ]);
}
