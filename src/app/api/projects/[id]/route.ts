import { body, json, route, type IdCtx } from "@/lib/http";
import { deleteProject, updateProject, type ProjectInput } from "@/lib/projects";

export const PATCH = route<IdCtx>(async (req, { params }) =>
  json(await updateProject((await params).id, await body<ProjectInput>(req))),
);

export const DELETE = route<IdCtx>(async (_req, { params }) => {
  await deleteProject((await params).id);
  return json({ ok: true });
});
