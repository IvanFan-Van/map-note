import { apiError } from "~/lib/api";
import { requireUser } from "~/server/auth";
import { reverseGeocode } from "~/server/nominatim";
import { isValidLatLng } from "~/lib/validate";
import type { Route } from "./+types/reverse";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireUser(request, env);
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  if (!isValidLatLng(lat, lng)) {
    return apiError(400, "INVALID_POSITION", "位置坐标无效");
  }
  try {
    const result = await reverseGeocode(lat, lng);
    return { ok: true, data: { result } };
  } catch {
    return apiError(502, "GEOCODE_FAILED", "地理编码服务暂不可用, 请稍后重试");
  }
}
