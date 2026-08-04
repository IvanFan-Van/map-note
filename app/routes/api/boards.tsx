import { requireUser } from "~/server/auth";
import { createBoard, getUserSettings, listBoardsForUser } from "~/server/db";
import type { Route } from "./+types/boards";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  const [boards, settings] = await Promise.all([
    listBoardsForUser(env, user.id),
    getUserSettings(env, user.id),
  ]);
  return { ok: true, data: { boards, defaultBoardId: settings.defaultBoardId } };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  if (request.method === "POST") {
    const body = (await request.json().catch(() => ({}))) as { name?: unknown };
    const name =
      typeof body.name === "string" && body.name.trim()
        ? body.name.trim().slice(0, 30)
        : "我的生活";
    const board = await createBoard(env, user.id, name);
    return { ok: true, data: { board } };
  }
  return new Response(
    JSON.stringify({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "不支持的请求方法" } }),
    { status: 405, headers: { "Content-Type": "application/json" } },
  );
}
