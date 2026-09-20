import { apiError } from "~/lib/api";
import { requireUser } from "~/server/auth";
import { addPostMedia, getPost, newId } from "~/server/db";
import type { Route } from "./+types/posts.$id.media";

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_SIZE = 5 * 1024 * 1024;

/** 为帖子上传一张照片 (仅作者) */
export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  if (request.method !== "POST") {
    return apiError(405, "METHOD_NOT_ALLOWED", "不支持的请求方法");
  }
  const post = await getPost(env, params.id);
  if (!post) return apiError(404, "NOT_FOUND", "帖子不存在");
  if (post.authorId !== user.id) {
    return apiError(403, "FORBIDDEN", "无权操作该帖子");
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError(400, "INVALID_INPUT", "表单解析失败");
  }
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) {
    return apiError(400, "INVALID_INPUT", "缺少图片文件");
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return apiError(400, "INVALID_TYPE", "仅支持 PNG / JPG / WebP / GIF");
  }
  if (file.size > MAX_SIZE) {
    return apiError(400, "TOO_LARGE", "图片不能超过 5MB");
  }
  const ext =
    file.type === "image/png" ? "png"
    : file.type === "image/webp" ? "webp"
    : file.type === "image/gif" ? "gif"
    : "jpg";
  const key = "posts/" + post.id + "/" + newId() + "." + ext;
  await env.IMAGES.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });
  const media = await addPostMedia(env, post.id, { key, width: 0, height: 0 });
  return { ok: true, data: { media } };
}
