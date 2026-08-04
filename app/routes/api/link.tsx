import { requireUser } from "~/server/auth";
import { deleteLink, getLink, now, updateLink } from "~/server/db";
import { assertEditor, broadcastPatch } from "~/server/permissions";
import type { Route } from "./+types/link";

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  const link = await getLink(env, params.id);
  if (!link) {
    return new Response(
      JSON.stringify({ ok: false, error: { code: "NOT_FOUND", message: "连线不存在" } }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }
  await assertEditor(env, link.boardId, user.id);

  if (request.method === "PATCH") {
    const body = (await request.json().catch(() => ({}))) as {
      color?: unknown;
      thickness?: unknown;
    };
    const updated = await updateLink(env, link.id, {
      color: typeof body.color === "string" ? body.color : undefined,
      thickness: typeof body.thickness === "number" ? body.thickness : undefined,
    });
    broadcastPatch(env, link.boardId, {
      type: "patch",
      entity: "link",
      id: link.id,
      changes: {
        color: updated!.color,
        thickness: updated!.thickness,
      },
      updatedAt: now(),
      sender: user.id,
    });
    return { ok: true, data: { link: updated } };
  }

  if (request.method === "DELETE") {
    await deleteLink(env, link.id);
    broadcastPatch(env, link.boardId, {
      type: "patch",
      entity: "link",
      id: link.id,
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
