import { requireUser } from "~/server/auth";
import { createLink, getNote, now } from "~/server/db";
import { assertEditor, broadcastPatch } from "~/server/permissions";
import type { Route } from "./+types/links";

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
    fromNoteId?: unknown;
    toNoteId?: unknown;
    color?: unknown;
    thickness?: unknown;
  };
  const boardId = String(body.boardId ?? "");
  const fromNoteId = String(body.fromNoteId ?? "");
  const toNoteId = String(body.toNoteId ?? "");
  if (!boardId || !fromNoteId || !toNoteId || fromNoteId === toNoteId) {
    return new Response(
      JSON.stringify({ ok: false, error: { code: "INVALID_INPUT", message: "参数无效" } }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  await assertEditor(env, boardId, user.id);
  const [from, to] = await Promise.all([getNote(env, fromNoteId), getNote(env, toNoteId)]);
  if (!from || !to || from.boardId !== boardId || to.boardId !== boardId) {
    return new Response(
      JSON.stringify({ ok: false, error: { code: "INVALID_INPUT", message: "便笺不存在或不属于该背景板" } }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  const color = typeof body.color === "string" ? body.color : "#e11d48";
  const thickness = typeof body.thickness === "number" ? body.thickness : 2;
  const link = await createLink(env, boardId, fromNoteId, toNoteId, color, thickness);
  broadcastPatch(env, boardId, {
    type: "patch",
    entity: "link",
    id: link.id,
    changes: link as unknown as Record<string, unknown>,
    updatedAt: now(),
    sender: user.id,
  });
  return { ok: true, data: { link } };
}
