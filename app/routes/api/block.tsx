import { apiError } from "~/lib/api";
import { requireUser } from "~/server/auth";
import { deleteBlock, getBlock, now, updateBlock } from "~/server/db";
import { assertEditor, broadcastPatch } from "~/server/permissions";
import type { Route } from "./+types/block";

const ALIGN_H = new Set(["left", "center", "right"]);
const ALIGN_V = new Set(["top", "middle", "bottom"]);

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  const block = await getBlock(env, params.id);
  if (!block) {
    return apiError(404, "NOT_FOUND", "文本块不存在");
  }
  await assertEditor(env, block.boardId, user.id);

  if (request.method === "PATCH") {
    const body = (await request.json().catch(() => ({}))) as {
      text?: unknown;
      width?: unknown;
      alignH?: unknown;
      alignV?: unknown;
    };
    const changes: Parameters<typeof updateBlock>[2] = {};
    if (typeof body.text === "string" && body.text.length <= 5000)
      changes.text = body.text;
    if (typeof body.width === "number" && body.width >= 80 && body.width <= 2000)
      changes.width = body.width;
    if (typeof body.alignH === "string" && ALIGN_H.has(body.alignH))
      changes.alignH = body.alignH as "left" | "center" | "right";
    if (typeof body.alignV === "string" && ALIGN_V.has(body.alignV))
      changes.alignV = body.alignV as "top" | "middle" | "bottom";
    const updated = await updateBlock(env, block.id, changes);
    if (!updated) {
      return apiError(404, "NOT_FOUND", "文本块不存在");
    }
    context.cloudflare.ctx.waitUntil(
      broadcastPatch(env, block.boardId, {
        type: "patch",
        entity: "block",
        id: updated.id,
        changes: {
          text: updated.text,
          width: updated.width,
          alignH: updated.alignH,
          alignV: updated.alignV,
          updatedAt: updated.updatedAt,
        },
        updatedAt: updated.updatedAt,
        sender: user.id,
      }),
    );
    return { ok: true, data: { block: updated } };
  }

  if (request.method === "DELETE") {
    await deleteBlock(env, block.id);
    context.cloudflare.ctx.waitUntil(
      broadcastPatch(env, block.boardId, {
        type: "patch",
        entity: "block",
        id: block.id,
        changes: { deleted: true },
        updatedAt: now(),
        sender: user.id,
      }),
    );
    return { ok: true, data: { deleted: true } };
  }

  return apiError(405, "METHOD_NOT_ALLOWED", "不支持的请求方法");
}
