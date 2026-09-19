import { apiError } from "~/lib/api";
import type { Place } from "~/lib/types";
import { getPlace } from "~/server/db";

/**
 * 读取地点并校验归属:
 * 地点不存在 → 404 响应, 非本人 → 403 响应, 通过 → 地点本身。
 * 调用方用 `instanceof Response` 判断并直接返回错误响应。
 */
export async function getOwnedPlace(
  env: Env,
  userId: string,
  placeId: string,
  forbiddenMessage = "无权操作该地点",
): Promise<Place | Response> {
  const place = await getPlace(env, placeId);
  if (!place) return apiError(404, "NOT_FOUND", "地点不存在");
  if (place.ownerId !== userId) return apiError(403, "FORBIDDEN", forbiddenMessage);
  return place;
}
