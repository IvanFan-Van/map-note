import { apiError } from "~/lib/api";
import { requireUser } from "~/server/auth";
import { deleteBoard, getBoardDetail, listNotes, setDefaultBoard } from "~/server/db";
import { assertMember } from "~/server/permissions";
import type { Route } from "./+types/board";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  const board = await getBoardDetail(env, params.id, user.id);
  if (!board) {
    throw apiError(403, "FORBIDDEN", "你不是该背景板的成员");
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
  if (request.method === "DELETE") {
    const board = await getBoardDetail(env, params.id, user.id);
    if (!board) {
      return apiError(404, "NOT_FOUND", "背景板不存在");
    }
    if (board.role !== "editor") {
      return apiError(403, "FORBIDDEN", "观看者无删除权限");
    }
    await deleteBoard(env, params.id);
    return { ok: true, data: { boardId: params.id } };
  }
  return apiError(405, "METHOD_NOT_ALLOWED", "不支持的请求方法");
}
