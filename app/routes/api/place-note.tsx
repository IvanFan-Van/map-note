import { apiError } from "~/lib/api";
import { requireUser } from "~/server/auth";
import { getOwnedPlace } from "~/server/access";
import { deletePlaceNote, updatePlaceNote } from "~/server/db";
import { validateNoteContent } from "~/lib/validate";
import type { Route } from "./+types/place-note";

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  const place = await getOwnedPlace(env, user.id, params.id);
  if (place instanceof Response) return place;

  if (request.method === "PATCH") {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const changes: { content?: string; position?: number } = {};
    if (typeof body.content === "string") {
      const content = body.content.trim();
      const contentError = validateNoteContent(content);
      if (contentError) return apiError(400, "INVALID_CONTENT", contentError);
      changes.content = content;
    }
    if (body.position !== undefined) {
      const pos = Number(body.position);
      if (!Number.isInteger(pos) || pos < 0) {
        return apiError(400, "INVALID_POSITION", "排序位置无效");
      }
      changes.position = pos;
    }
    const note = await updatePlaceNote(env, place.id, params.noteId, changes);
    if (!note) return apiError(404, "NOT_FOUND", "笔记不存在");
    return { ok: true, data: { note } };
  }

  if (request.method === "DELETE") {
    await deletePlaceNote(env, place.id, params.noteId);
    return { ok: true, data: { deleted: true } };
  }

  return apiError(405, "METHOD_NOT_ALLOWED", "不支持的请求方法");
}
