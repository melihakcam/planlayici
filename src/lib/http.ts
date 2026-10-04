import { NextResponse } from "next/server";

export type IdCtx = { params: Promise<{ id: string }> };

export const json = (data: unknown, status = 200) => NextResponse.json(data ?? { ok: true }, { status });

/** Hataları JSON olarak döndüren rota sarmalayıcısı. */
export function route<C = unknown>(fn: (req: Request, ctx: C) => Promise<Response> | Response) {
  return async (req: Request, ctx: C) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      console.error(e);
      return json({ error: (e as Error).message || "Beklenmeyen hata" }, 400);
    }
  };
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}
