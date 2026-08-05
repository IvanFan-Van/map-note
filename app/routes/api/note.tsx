import { apiError } from "~/lib/api";
import { requireUser } from "~/server/auth";
import { deleteNote, getNote, now, updateNote } from "~/server/db";
import { assertEditor, broadcastPatch } from "~/server/permissions";
import type { Route } from "./+types/note";

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  const note = await getNote(env, params.id);
  if (!note) {
    return apiError(404, "NOT_FOUND", "便笺不存在");
  }
  await assertEditor(env, note.boardId, user.id);

  if (request.method === "PATCH") {
    const body = (await request.json().catch(() => ({}))) as {
      content?: unknown;
      meta?: unknown;
      mood?: unknown;
      weather?: unknown;
      fatigue?: unknown;
      diet?: unknown;
    };
    const changes: Parameters<typeof updateNote>[2] = {};
    if (typeof body.content === "string") changes.content = body.content;
    if (body.meta !== undefined) {
      // 元属性 (Obsidian 式): JSON 对象; 空键/空值忽略 (等价删除), 限制数量与长度
      if (
        body.meta === null ||
        typeof body.meta !== "object" ||
        Array.isArray(body.meta)
      ) {
        return apiError(400, "INVALID_META", "元属性格式不正确");
      }
      const meta: Record<string, string> = {};
      for (const [k, v] of Object.entries(body.meta as Record<string, unknown>)) {
        const key = k.trim();
        if (key === "" || key.length > 16) continue;
        if (typeof v !== "string") continue;
        const val = v.trim();
        if (val === "") continue;
        if (val.length > 50) {
          return apiError(400, "INVALID_META", `属性 "${key}" 的值过长`);
        }
        meta[key] = val;
      }
      if (Object.keys(meta).length > 8) {
        return apiError(400, "INVALID_META", "元属性数量不能超过 8 个");
      }
      changes.meta = meta;
    }
    if (body.mood === null || typeof body.mood === "string") changes.mood = body.mood as string | null;
    if (body.weather === null || typeof body.weather === "string")
      changes.weather = body.weather as string | null;
    if (body.fatigue === null || typeof body.fatigue === "number")
      changes.fatigue = body.fatigue as number | null;
    if (body.diet === null || typeof body.diet === "string") changes.diet = body.diet as string | null;
    const updated = await updateNote(env, note.id, changes);
    if (!updated) {
      return apiError(404, "NOT_FOUND", "便笺不存在");
    }
    context.cloudflare.ctx.waitUntil(
      broadcastPatch(env, note.boardId, {
        type: "patch",
        entity: "note",
        id: updated.id,
        changes: {
          content: updated.content,
          meta: updated.meta,
          mood: updated.mood,
          weather: updated.weather,
          fatigue: updated.fatigue,
          diet: updated.diet,
          updatedAt: updated.updatedAt,
        },
        updatedAt: updated.updatedAt,
        sender: user.id,
      }),
    );
    return { ok: true, data: { note: updated } };
  }

  if (request.method === "DELETE") {
    await deleteNote(env, note.id);
    context.cloudflare.ctx.waitUntil(
      broadcastPatch(env, note.boardId, {
        type: "patch",
        entity: "note",
        id: note.id,
        changes: { deleted: true },
        updatedAt: now(),
        sender: user.id,
      }),
    );
    return { ok: true, data: { deleted: true } };
  }

  return apiError(405, "METHOD_NOT_ALLOWED", "不支持的请求方法");
}
