import { apiError } from "~/lib/api";
import { requireUser } from "~/server/auth";
import { getOwnedPlace } from "~/server/access";
import { deletePlace, updatePlace } from "~/server/db";
import { isValidLatLng } from "~/lib/validate";
import type { MetaItem, PhotoItem } from "~/lib/types";
import type { Route } from "./+types/place";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  const place = await getOwnedPlace(env, user.id, params.id, "无权访问该地点");
  if (place instanceof Response) return place;
  return { ok: true, data: { place } };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  const place = await getOwnedPlace(env, user.id, params.id);
  if (place instanceof Response) return place;

  if (request.method === "PATCH") {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const changes: Parameters<typeof updatePlace>[2] = {};
    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (name.length < 1 || name.length > 60) {
        return apiError(400, "INVALID_NAME", "地点名称需为 1~60 个字符");
      }
      changes.name = name;
    }
    if (typeof body.address === "string") {
      changes.address = body.address.trim().slice(0, 200);
    }
    if (typeof body.description === "string") {
      changes.description = body.description.trim().slice(0, 2000);
    }
    if (body.lat !== undefined || body.lng !== undefined) {
      const lat = Number(body.lat);
      const lng = Number(body.lng);
      if (!isValidLatLng(lat, lng)) {
        return apiError(400, "INVALID_POSITION", "位置坐标无效");
      }
      changes.lat = lat;
      changes.lng = lng;
    }
    if (body.photos !== undefined) {
      if (!Array.isArray(body.photos) || body.photos.length > 30) {
        return apiError(400, "INVALID_PHOTOS", "照片组格式不正确");
      }
      const photos: PhotoItem[] = [];
      for (const p of body.photos as unknown[]) {
        const item = p as Partial<PhotoItem>;
        if (
          !item ||
          typeof item.key !== "string" ||
          typeof item.url !== "string" ||
          item.key.length > 300
        ) {
          return apiError(400, "INVALID_PHOTOS", "照片组格式不正确");
        }
        photos.push({ key: item.key, url: item.url });
      }
      changes.photos = photos;
    }
    if (body.metas !== undefined) {
      if (!Array.isArray(body.metas) || body.metas.length > 20) {
        return apiError(400, "INVALID_METAS", "元信息格式不正确");
      }
      const metas: MetaItem[] = [];
      for (const m of body.metas as unknown[]) {
        const item = m as Partial<MetaItem>;
        const label = typeof item.label === "string" ? item.label.trim() : "";
        const score = Number(item.score);
        if (label.length < 1 || label.length > 20) {
          return apiError(400, "INVALID_METAS", "元信息名称需为 1~20 个字符");
        }
        if (!Number.isInteger(score) || score < 1 || score > 5) {
          return apiError(400, "INVALID_METAS", "元信息评分需为 1~5 的整数");
        }
        metas.push({ id: String(item.id ?? crypto.randomUUID()), label, score, custom: item.custom === true });
      }
      changes.metas = metas;
    }
    const updated = await updatePlace(env, place.id, changes);
    return { ok: true, data: { place: updated } };
  }

  if (request.method === "DELETE") {
    await deletePlace(env, place.id);
    return { ok: true, data: { deleted: true } };
  }

  return apiError(405, "METHOD_NOT_ALLOWED", "不支持的请求方法");
}
