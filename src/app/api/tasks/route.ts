import { body, json, route } from "@/lib/http";
import { createTask, listTasks, type TaskInput } from "@/lib/tasks";

export const dynamic = "force-dynamic";

export const GET = route(async () => json(await listTasks()));
export const POST = route(async (req) => json(await createTask(await body<TaskInput>(req)), 201));
