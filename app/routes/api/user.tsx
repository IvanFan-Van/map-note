import { apiError } from "~/lib/api";
import { requireUser } from "~/server/auth";
import { updateUserName } from "~/server/db";
import type { Route } from "./+types/user";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  return { ok: true, data: { user } };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  if (request.method !== "PATCH") {
    return apiError(405, "METHOD_NOT_ALLOWED", "不支持的请求方法");
  }
  const body = (await request.json().catch(() => ({}))) as { name?: unknown };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 1 || name.length > 20) {
    return apiError(400, "INVALID_NAME", "昵称需为 1~20 个字符");
  }
  await updateUserName(env, user.id, name);
  return { ok: true, data: { user: { ...user, name } } };
}
