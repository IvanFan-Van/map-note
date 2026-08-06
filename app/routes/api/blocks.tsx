import { apiError } from "~/lib/api";
import { requireUser } from "~/server/auth";
import { createBlock, getBoardDetail, now } from "~/server/db";
import { assertEditor, broadcastPatch } from "~/server/permissions";
import type { Route } from "./+types/blocks";

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  if (request.method !== "POST") {
    return apiError(405, "METHOD_NOT_ALLOWED", "不支持的请求方法");
  }
  const body = (await request.json().catch(() => ({}))) as {
    boardId?: unknown;
    x?: unknown;
    y?: unknown;
    text?: unknown;
  };
  const boardId = String(body.boardId ?? "");
  if (!boardId || typeof body.x !== "number" || typeof body.y !== "number") {
    return apiError(400, "INVALID_INPUT", "缺少必要参数");
  }
  const board = await getBoardDetail(env, boardId, user.id);
  if (!board) {
    return apiError(404, "NOT_FOUND", "背景板不存在");
  }
  await assertEditor(env, boardId, user.id);
  const block = await createBlock(env, boardId, user.id, {
    x: body.x,
    y: body.y,
    text: typeof body.text === "string" ? body.text : "",
  });
  context.cloudflare.ctx.waitUntil(
    broadcastPatch(env, boardId, {
      type: "patch",
      entity: "block",
      id: block.id,
      changes: block as unknown as Record<string, unknown>,
      updatedAt: now(),
      sender: user.id,
    }),
  );
  return { ok: true, data: { block } };
}
