import { requireUser } from "~/server/auth";
import { getNote, moveNote } from "~/server/db";
import { assertEditor, broadcastPatch } from "~/server/permissions";
import type { Route } from "./+types/note-position";

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  if (request.method !== "PUT") {
    return new Response(
      JSON.stringify({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "不支持的请求方法" } }),
      { status: 405, headers: { "Content-Type": "application/json" } },
    );
  }
  const note = await getNote(env, params.id);
  if (!note) {
    return new Response(
      JSON.stringify({ ok: false, error: { code: "NOT_FOUND", message: "便笺不存在" } }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }
  await assertEditor(env, note.boardId, user.id);
  const body = (await request.json().catch(() => ({}))) as {
    x?: unknown;
    y?: unknown;
    zIndex?: unknown;
  };
  if (typeof body.x !== "number" || typeof body.y !== "number") {
    return new Response(
      JSON.stringify({ ok: false, error: { code: "INVALID_INPUT", message: "缺少坐标参数" } }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  const updated = await moveNote(
    env,
    note.id,
    body.x,
    body.y,
    typeof body.zIndex === "number" ? body.zIndex : undefined,
  );
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
