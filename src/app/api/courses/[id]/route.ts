import { deleteCourse, listCourses, updateCourse, type CourseInput } from "@/lib/courses";
import { body, json, route, type IdCtx } from "@/lib/http";

export const PATCH = route<IdCtx>(async (req, { params }) => {
  await updateCourse((await params).id, await body<CourseInput>(req));
  return json(await listCourses());
});

export const DELETE = route<IdCtx>(async (_req, { params }) => {
  await deleteCourse((await params).id);
  return json(await listCourses());
});
