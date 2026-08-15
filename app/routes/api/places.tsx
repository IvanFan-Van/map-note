import { apiError } from "~/lib/api";
import { requireUser } from "~/server/auth";
import { createPlace, listPlaces } from "~/server/db";
import type { Route } from "./+types/places";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  const places = await listPlaces(env, user.id);
  return { ok: true, data: { places } };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  if (request.method !== "POST") {
    return apiError(405, "METHOD_NOT_ALLOWED", "不支持的请求方法");
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const address = typeof body.address === "string" ? body.address.trim().slice(0, 200) : "";
  const description =
    typeof body.description === "string"
      ? body.description.trim().slice(0, 2000)
      : "还未有任何描述";
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (name.length < 1 || name.length > 60) {
    return apiError(400, "INVALID_NAME", "地点名称需为 1~60 个字符");
  }
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return apiError(400, "INVALID_POSITION", "位置坐标无效");
  }
  const place = await createPlace(env, user.id, {
    name,
    address,
    description: description || "还未有任何描述",
    lat,
    lng,
  });
  return { ok: true, data: { place } };
}
