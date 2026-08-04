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
    return new Response(
      JSON.stringify({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "不支持的请求方法" } }),
      { status: 405, headers: { "Content-Type": "application/json" } },
    );
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: { code: "INVALID_INPUT", message: "表单解析失败" } }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  const file = form.get("file");
  const boardId = String(form.get("boardId") ?? "");
  const noteId = String(form.get("noteId") ?? "");
  const width = Number(form.get("width") ?? 0);
  const height = Number(form.get("height") ?? 0);
  if (!(file instanceof File) || !file.size) {
    return new Response(
      JSON.stringify({ ok: false, error: { code: "INVALID_INPUT", message: "缺少图片文件" } }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return new Response(
      JSON.stringify({ ok: false, error: { code: "INVALID_TYPE", message: "仅支持 PNG / JPG / WebP / GIF" } }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  if (file.size > MAX_SIZE) {
    return new Response(
      JSON.stringify({ ok: false, error: { code: "TOO_LARGE", message: "图片不能超过 5MB" } }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  const board = await getBoardDetail(env, boardId, user.id);
  if (!board) {
    return new Response(
      JSON.stringify({ ok: false, error: { code: "FORBIDDEN", message: "你不是该背景板的成员" } }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
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
