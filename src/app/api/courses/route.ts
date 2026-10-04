import { createCourse, listCourses, type CourseInput } from "@/lib/courses";
import { body, json, route } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = route(async () => json(await listCourses()));

export const POST = route(async (req) => {
  await createCourse(await body<CourseInput>(req));
  return json(await listCourses(), 201);
});
