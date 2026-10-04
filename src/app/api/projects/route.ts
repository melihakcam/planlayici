import { body, json, route } from "@/lib/http";
import { createProject, listProjectStats, type ProjectInput } from "@/lib/projects";

export const dynamic = "force-dynamic";

/** Projeler + bu haftaki ilerleme. Fikirler yalnızca ?fikirler=1 ile gelir (Projeler sayfası). */
export const GET = route(async (req) => {
  const list = await listProjectStats();
  return json(new URL(req.url).searchParams.get("fikirler") ? list : list.filter((p) => p.status !== "fikir"));
});

export const POST = route(async (req) => json(await createProject(await body<ProjectInput>(req)), 201));
