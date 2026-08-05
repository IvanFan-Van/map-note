import { apiError } from "~/lib/api";
import { getSessionUser, requireUser } from "~/server/auth";
import { getUserSettings } from "~/server/db";
import type { Route } from "./+types/user";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await getSessionUser(request, env);
  if (!user) return apiError(401, "UNAUTHORIZED", "请先登录");
  const settings = await getUserSettings(env, user.id);
  return { ok: true, data: { user, settings } };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  if (request.method !== "PATCH") {
    return apiError(405, "METHOD_NOT_ALLOWED", "不支持的请求方法");
  }
  const user = await requireUser(request, env);
  const body = (await request.json().catch(() => ({}))) as { name?: unknown };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 1 || name.length > 20) {
    return apiError(400, "INVALID_NAME", "昵称需为 1~20 个字符");
  }
  await env.DB.prepare(`UPDATE users SET name = ? WHERE id = ?`)
    .bind(name, user.id)
    .run();
  return { ok: true, data: { user: { ...user, name } } };
}
