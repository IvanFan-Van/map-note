import { apiError } from "~/lib/api";
import { isValidLatLng, validatePostContent } from "~/lib/validate";
import { requireUser } from "~/server/auth";
import { createPost, findOrCreateLocation } from "~/server/db";
import type { Route } from "./+types/posts";

/** 创建帖子 (必须带定位) */
export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  if (request.method !== "POST") {
    return apiError(405, "METHOD_NOT_ALLOWED", "不支持的请求方法");
  }
  const body = (await request.json().catch(() => ({}))) as {
    title?: unknown;
    content?: unknown;
    lat?: unknown;
    lng?: unknown;
    placeName?: unknown;
    address?: unknown;
    amapPoiId?: unknown;
    visibility?: unknown;
  };
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (title.length < 1 || title.length > 80) {
    return apiError(400, "INVALID_TITLE", "标题需为 1~80 个字符");
  }
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const contentError = validatePostContent(content);
  if (contentError) return apiError(400, "INVALID_CONTENT", contentError);
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!isValidLatLng(lat, lng)) {
    return apiError(400, "INVALID_POSITION", "请先选择帖子定位");
  }
  const visibility = body.visibility === "private" ? "private" : "public";
  const placeName = typeof body.placeName === "string" ? body.placeName.trim().slice(0, 80) : "";
  const address = typeof body.address === "string" ? body.address.trim().slice(0, 200) : "";
  const amapPoiId =
    typeof body.amapPoiId === "string" && body.amapPoiId.trim() ? body.amapPoiId.trim() : undefined;

  const location = await findOrCreateLocation(env, { name: placeName, address, lat, lng, amapPoiId });
  const post = await createPost(env, user.id, {
    locationId: location.id,
    lat,
    lng,
    placeName,
    address,
    title,
    content,
    visibility,
  });
  return { ok: true, data: { post } };
}
