import { apiError } from "~/lib/api";
import { requireUser } from "~/server/auth";
import { searchPlaces } from "~/server/amap";
import type { Route } from "./+types/geocode";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireUser(request, env);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 200);
  const limit = Number(url.searchParams.get("limit")) || 5;
  const nearLat = Number(url.searchParams.get("nearLat"));
  const nearLng = Number(url.searchParams.get("nearLng"));
  const near =
    Number.isFinite(nearLat) && Number.isFinite(nearLng) ? { lat: nearLat, lng: nearLng } : undefined;
  if (!q) return apiError(400, "INVALID_QUERY", "缺少搜索词");
  if (!env.AMAP_WEB_KEY) {
    return apiError(503, "GEOCODE_UNAVAILABLE", "地理编码服务未配置");
  }
  try {
    const results = await searchPlaces(env.AMAP_WEB_KEY, q, near, limit);
    return { ok: true, data: { results } };
  } catch {
    return apiError(502, "GEOCODE_FAILED", "地理编码服务暂不可用, 请稍后重试");
  }
}
