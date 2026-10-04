import { body, json, route, type IdCtx } from "@/lib/http";
import { deleteTask, updateTask, type TaskInput } from "@/lib/tasks";

export const PATCH = route<IdCtx>(async (req, { params }) =>
  json(await updateTask((await params).id, await body<TaskInput>(req))),
);

export const DELETE = route<IdCtx>(async (_req, { params }) => {
  await deleteTask((await params).id);
  return json({ ok: true });
});
