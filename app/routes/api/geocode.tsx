import { apiError } from "~/lib/api";
import { requireUser } from "~/server/auth";
import { searchPlaces } from "~/server/nominatim";
import type { Route } from "./+types/geocode";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireUser(request, env);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 200);
  const limit = Number(url.searchParams.get("limit")) || 5;
  const vb = url.searchParams.get("viewbox");
  let near: { lat: number; lng: number } | undefined;
  if (vb) {
    const parts = vb.split(",").map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      near = { lng: (parts[0] + parts[2]) / 2, lat: (parts[1] + parts[3]) / 2 };
    }
  }
  if (!q) return apiError(400, "INVALID_QUERY", "缺少搜索词");
  try {
    const results = await searchPlaces(q, near, limit);
    return { ok: true, data: { results } };
  } catch {
    return apiError(502, "GEOCODE_FAILED", "地理编码服务暂不可用, 请稍后重试");
  }
}
