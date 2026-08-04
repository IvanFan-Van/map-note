import { getSessionUser, requireUser } from "~/server/auth";
import { getUserSettings } from "~/server/db";
import type { Route } from "./+types/user";

function unauthorized() {
  return new Response(
    JSON.stringify({ ok: false, error: { code: "UNAUTHORIZED", message: "请先登录" } }),
    { status: 401, headers: { "Content-Type": "application/json" } },
  );
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await getSessionUser(request, env);
  if (!user) return unauthorized();
  const settings = await getUserSettings(env, user.id);
  return { ok: true, data: { user, settings } };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  if (request.method !== "PATCH") {
    return new Response(
      JSON.stringify({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "不支持的请求方法" } }),
      { status: 405, headers: { "Content-Type": "application/json" } },
    );
  }
  const user = await requireUser(request, env);
  const body = (await request.json().catch(() => ({}))) as { name?: unknown };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 1 || name.length > 20) {
    return new Response(
      JSON.stringify({ ok: false, error: { code: "INVALID_NAME", message: "昵称需为 1~20 个字符" } }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  await env.DB.prepare(`UPDATE users SET name = ? WHERE id = ?`)
    .bind(name, user.id)
    .run();
  return { ok: true, data: { user: { ...user, name } } };
}
