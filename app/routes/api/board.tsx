import { requireUser } from "~/server/auth";
import { getBoardDetail, listNotes, setDefaultBoard } from "~/server/db";
import { assertMember } from "~/server/permissions";
import type { Route } from "./+types/board";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  const board = await getBoardDetail(env, params.id, user.id);
  if (!board) {
    throw new Response(
      JSON.stringify({ ok: false, error: { code: "FORBIDDEN", message: "你不是该背景板的成员" } }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }
  const notes = await listNotes(env, params.id);
  return { ok: true, data: { board, notes } };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  const url = new URL(request.url);
  if (request.method === "POST" && url.searchParams.get("action") === "default") {
    await assertMember(env, params.id, user.id);
    await setDefaultBoard(env, user.id, params.id);
    return { ok: true, data: { defaultBoardId: params.id } };
  }
  return new Response(
    JSON.stringify({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "不支持的请求方法" } }),
    { status: 405, headers: { "Content-Type": "application/json" } },
  );
}
