import { apiError } from "~/lib/api";
import { requireUser } from "~/server/auth";
import { getBlock, moveBlock } from "~/server/db";
import { assertEditor, broadcastPatch } from "~/server/permissions";
import type { Route } from "./+types/block-position";

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  if (request.method !== "PUT") {
    return apiError(405, "METHOD_NOT_ALLOWED", "不支持的请求方法");
  }
  const block = await getBlock(env, params.id);
  if (!block) {
    return apiError(404, "NOT_FOUND", "文本块不存在");
  }
  await assertEditor(env, block.boardId, user.id);
  const body = (await request.json().catch(() => ({}))) as {
    x?: unknown;
    y?: unknown;
  };
  if (typeof body.x !== "number" || typeof body.y !== "number") {
    return apiError(400, "INVALID_INPUT", "缺少坐标参数");
  }
  const updated = await moveBlock(env, block.id, body.x, body.y);
  context.cloudflare.ctx.waitUntil(
    broadcastPatch(env, block.boardId, {
      type: "patch",
      entity: "block",
      id: block.id,
      changes: { posX: body.x, posY: body.y, updatedAt: updated!.updatedAt },
      updatedAt: updated!.updatedAt,
      sender: user.id,
    }),
  );
  return { ok: true, data: { block: updated } };
}
