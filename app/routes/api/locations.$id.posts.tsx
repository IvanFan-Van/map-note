import { apiError } from "~/lib/api";
import { getSessionUser } from "~/server/auth";
import { getLocationById, listLocationPosts } from "~/server/db";
import type { Route } from "./+types/locations.$id.posts";

/** 某地点下的帖子列表 (抽屉), 游标分页 */
export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await getSessionUser(request, env);
  const location = await getLocationById(env, params.id);
  if (!location) return apiError(404, "NOT_FOUND", "地点不存在");
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 20, 1), 50);
  const { posts, nextCursor } = await listLocationPosts(env, location.id, user?.id ?? null, cursor, limit);
  return { ok: true, data: { location, posts, nextCursor } };
}
