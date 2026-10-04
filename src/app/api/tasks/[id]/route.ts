import { body, json, route, type IdCtx } from "@/lib/http";
import { deleteTask, dropFutureBlocks, updateTask, type TaskInput } from "@/lib/tasks";

export const PATCH = route<IdCtx>(async (req, { params }) =>
  json(await updateTask((await params).id, await body<TaskInput>(req))),
);

/** ?only=blocks → görevi silmeden yalnızca gelecekteki zaman bloklarını kaldırır. */
export const DELETE = route<IdCtx>(async (req, { params }) => {
  const { id } = await params;
  if (new URL(req.url).searchParams.get("only") === "blocks") await dropFutureBlocks(id);
  else await deleteTask(id);
  return json({ ok: true });
});
