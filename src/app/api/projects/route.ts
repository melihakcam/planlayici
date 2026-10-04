import { body, json, route } from "@/lib/http";
import { createProject, listProjectStats, type ProjectInput } from "@/lib/projects";

export const dynamic = "force-dynamic";

/** Projeler + bu haftaki ilerleme */
export const GET = route(async () => json(await listProjectStats()));

export const POST = route(async (req) => json(await createProject(await body<ProjectInput>(req)), 201));
