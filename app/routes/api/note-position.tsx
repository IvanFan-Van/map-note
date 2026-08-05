import { apiError } from "~/lib/api";
import { requireUser } from "~/server/auth";
import { getNote, moveNote } from "~/server/db";
import { assertEditor, broadcastPatch } from "~/server/permissions";
import type { Route } from "./+types/note-position";

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  if (request.method !== "PUT") {
    return apiError(405, "METHOD_NOT_ALLOWED", "不支持的请求方法");
  }
  const note = await getNote(env, params.id);
  if (!note) {
    return apiError(404, "NOT_FOUND", "便笺不存在");
  }
  await assertEditor(env, note.boardId, user.id);
  const body = (await request.json().catch(() => ({}))) as {
    x?: unknown;
    y?: unknown;
  };
  if (typeof body.x !== "number" || typeof body.y !== "number") {
    return apiError(400, "INVALID_INPUT", "缺少坐标参数");
  }
  const updated = await moveNote(env, note.id, body.x, body.y);
  context.cloudflare.ctx.waitUntil(
    broadcastPatch(env, note.boardId, {
      type: "patch",
      entity: "note",
      id: note.id,
      changes: { posX: body.x, posY: body.y, updatedAt: updated!.updatedAt },
      updatedAt: updated!.updatedAt,
      sender: user.id,
    }),
  );
  return { ok: true, data: { note: updated } };
}
