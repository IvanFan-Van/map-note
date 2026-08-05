import { requireUser } from "~/server/auth";
import { createNote, getBoardDetail } from "~/server/db";
import { assertEditor, broadcastPatch } from "~/server/permissions";
import { now } from "~/server/db";
import type { Route } from "./+types/notes";

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "不支持的请求方法" } }),
      { status: 405, headers: { "Content-Type": "application/json" } },
    );
  }
  const body = (await request.json().catch(() => ({}))) as {
    boardId?: unknown;
    x?: unknown;
    y?: unknown;
    content?: unknown;
    width?: unknown;
  };
  const boardId = String(body.boardId ?? "");
  if (!boardId || typeof body.x !== "number" || typeof body.y !== "number") {
    return new Response(
      JSON.stringify({ ok: false, error: { code: "INVALID_INPUT", message: "缺少必要参数" } }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  const board = await getBoardDetail(env, boardId, user.id);
  if (!board) {
    return new Response(
      JSON.stringify({ ok: false, error: { code: "NOT_FOUND", message: "背景板不存在" } }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }
  await assertEditor(env, boardId, user.id);
  const note = await createNote(env, boardId, user.id, {
    x: body.x,
    y: body.y,
    content: typeof body.content === "string" ? body.content : "",
    width: typeof body.width === "number" ? body.width : 260,
  });
  // waitUntil 保持 worker 存活到广播完成 (action 返回后异步 fetch 会被终止)
  context.cloudflare.ctx.waitUntil(
    broadcastPatch(env, boardId, {
      type: "patch",
      entity: "note",
      id: note.id,
      changes: note as unknown as Record<string, unknown>,
      updatedAt: now(),
      sender: user.id,
    }),
  );
  return { ok: true, data: { note } };
}
