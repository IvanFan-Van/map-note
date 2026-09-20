import { apiError } from "~/lib/api";
import { listLocationsInBounds } from "~/server/db";
import type { Route } from "./+types/map";

/** 地图视野内的地点与帖子数量 (公开浏览, 无需登录) */
export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const bbox = (url.searchParams.get("bbox") ?? "").split(",").map(Number);
  if (bbox.length !== 4 || !bbox.every(Number.isFinite)) {
    return apiError(400, "INVALID_BBOX", "缺少有效的视野范围");
  }
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const locations = await listLocationsInBounds(context.cloudflare.env, {
    minLat,
    minLng,
    maxLat,
    maxLng,
  });
  return { ok: true, data: { locations } };
}
