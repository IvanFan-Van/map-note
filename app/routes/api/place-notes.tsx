import { apiError } from "~/lib/api";
import { requireUser } from "~/server/auth";
import { createPlaceNote, getPlace } from "~/server/db";
import type { Route } from "./+types/place-notes";

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  const place = await getPlace(env, params.id);
  if (!place) return apiError(404, "NOT_FOUND", "地点不存在");
  if (place.ownerId !== user.id) return apiError(403, "FORBIDDEN", "无权操作该地点");
  if (request.method !== "POST") {
    return apiError(405, "METHOD_NOT_ALLOWED", "不支持的请求方法");
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (content.length < 1) {
    return apiError(400, "INVALID_CONTENT", "笔记内容不能为空");
  }
  if (content.length > 5000) {
    return apiError(400, "INVALID_CONTENT", "笔记内容不能超过 5000 个字符");
  }
  const note = await createPlaceNote(env, place.id, content);
  return { ok: true, data: { note } };
}
