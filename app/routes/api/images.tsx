import { apiError } from "~/lib/api";
import { requireUser } from "~/server/auth";
import { getPlace, newId } from "~/server/db";
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
  const placeId = String(form.get("placeId") ?? "").trim();
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
  const place = await getPlace(env, placeId);
  if (!place) return apiError(404, "NOT_FOUND", "地点不存在");
  if (place.ownerId !== user.id) return apiError(403, "FORBIDDEN", "无权操作该地点");
  const ext =
    file.type === "image/png" ? "png"
    : file.type === "image/webp" ? "webp"
    : file.type === "image/gif" ? "gif"
    : "jpg";
  const key = "places/" + placeId + "/" + newId() + "." + ext;
  await env.IMAGES.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: {
      width: String(width || 0),
      height: String(height || 0),
    },
  });
  return { ok: true, data: { image: { key, url: "/images/" + key, width, height } } };
}
