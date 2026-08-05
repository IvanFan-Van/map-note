import { apiError } from "~/lib/api";
import { requireUser } from "~/server/auth";
import { getBoardDetail, newId } from "~/server/db";
import { assertEditor } from "~/server/permissions";
import type { Route } from "./+types/images";

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_SIZE = 5 * 1024 * 1024;

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  if (request.method !== "POST") {
    return apiError(405, "METHOD_NOT_ALLOWED", "不支持的请求方法");
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError(400, "INVALID_INPUT", "表单解析失败");
  }
  const file = form.get("file");
  const boardId = String(form.get("boardId") ?? "");
  const noteId = String(form.get("noteId") ?? "");
  const width = Number(form.get("width") ?? 0);
  const height = Number(form.get("height") ?? 0);
  if (!(file instanceof File) || !file.size) {
    return apiError(400, "INVALID_INPUT", "缺少图片文件");
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return apiError(400, "INVALID_TYPE", "仅支持 PNG / JPG / WebP / GIF");
  }
  if (file.size > MAX_SIZE) {
    return apiError(400, "TOO_LARGE", "图片不能超过 5MB");
  }
  const board = await getBoardDetail(env, boardId, user.id);
  if (!board) {
    return apiError(403, "FORBIDDEN", "你不是该背景板的成员");
  }
  await assertEditor(env, boardId, user.id);
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : file.type === "image/gif" ? "gif" : "jpg";
  const key = `boards/${boardId}/notes/${noteId || "draft"}/${newId()}.${ext}`;
  await env.IMAGES.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: {
      width: String(width || 0),
      height: String(height || 0),
    },
  });
  return { ok: true, data: { image: { url: `/images/${key}`, width, height } } };
}
