import { requireUser } from "~/server/auth";
import { deleteNote, getNote, now, updateNote } from "~/server/db";
import { assertEditor, broadcastPatch } from "~/server/permissions";
import type { Route } from "./+types/note";

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  const note = await getNote(env, params.id);
  if (!note) {
    return new Response(
      JSON.stringify({ ok: false, error: { code: "NOT_FOUND", message: "便笺不存在" } }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }
  await assertEditor(env, note.boardId, user.id);

  if (request.method === "PATCH") {
    const body = (await request.json().catch(() => ({}))) as {
      content?: unknown;
      mood?: unknown;
      weather?: unknown;
      fatigue?: unknown;
      diet?: unknown;
    };
    const changes: Parameters<typeof updateNote>[2] = {};
    if (typeof body.content === "string") changes.content = body.content;
    if (body.mood === null || typeof body.mood === "string") changes.mood = body.mood as string | null;
    if (body.weather === null || typeof body.weather === "string")
      changes.weather = body.weather as string | null;
    if (body.fatigue === null || typeof body.fatigue === "number")
      changes.fatigue = body.fatigue as number | null;
    if (body.diet === null || typeof body.diet === "string") changes.diet = body.diet as string | null;
    const updated = await updateNote(env, note.id, changes);
    if (!updated) {
      return new Response(
        JSON.stringify({ ok: false, error: { code: "NOT_FOUND", message: "便笺不存在" } }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }
    broadcastPatch(env, note.boardId, {
      type: "patch",
      entity: "note",
      id: updated.id,
      changes: {
        content: updated.content,
        mood: updated.mood,
        weather: updated.weather,
        fatigue: updated.fatigue,
        diet: updated.diet,
        updatedAt: updated.updatedAt,
      },
      updatedAt: updated.updatedAt,
      sender: user.id,
    });
    return { ok: true, data: { note: updated } };
  }

  if (request.method === "DELETE") {
    await deleteNote(env, note.id);
    broadcastPatch(env, note.boardId, {
      type: "patch",
      entity: "note",
      id: note.id,
      changes: { deleted: true },
      updatedAt: now(),
      sender: user.id,
    });
    return { ok: true, data: { deleted: true } };
  }

  return new Response(
    JSON.stringify({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "不支持的请求方法" } }),
    { status: 405, headers: { "Content-Type": "application/json" } },
  );
}
