import { requireUser } from "~/server/auth";
import { acceptInvitation, declineInvitation } from "~/server/db";
import type { Route } from "./+types/invitation";

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "不支持的请求方法" } }),
      { status: 405, headers: { "Content-Type": "application/json" } },
    );
  }
  const body = (await request.json().catch(() => ({}))) as { action?: unknown };
  if (body.action === "accept") {
    const result = await acceptInvitation(env, params.id, user.id);
    if (!result) {
      return new Response(
        JSON.stringify({ ok: false, error: { code: "NOT_FOUND", message: "邀请不存在或已处理" } }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }
    return { ok: true, data: { boardId: result.boardId, boardName: result.boardName, role: result.role } };
  }
  if (body.action === "decline") {
    const ok = await declineInvitation(env, params.id, user.id);
    if (!ok) {
      return new Response(
        JSON.stringify({ ok: false, error: { code: "NOT_FOUND", message: "邀请不存在或已处理" } }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }
    return { ok: true, data: { declined: true } };
  }
  return new Response(
    JSON.stringify({ ok: false, error: { code: "INVALID_INPUT", message: "action 需为 accept 或 decline" } }),
    { status: 400, headers: { "Content-Type": "application/json" } },
  );
}
