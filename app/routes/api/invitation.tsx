import { apiError } from "~/lib/api";
import { requireUser } from "~/server/auth";
import { acceptInvitation, declineInvitation } from "~/server/db";
import type { Route } from "./+types/invitation";

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  if (request.method !== "POST") {
    return apiError(405, "METHOD_NOT_ALLOWED", "不支持的请求方法");
  }
  const body = (await request.json().catch(() => ({}))) as { action?: unknown };
  if (body.action === "accept") {
    const result = await acceptInvitation(env, params.id, user.id);
    if (!result) {
      return apiError(404, "NOT_FOUND", "邀请不存在或已处理");
    }
    return { ok: true, data: { boardId: result.boardId, boardName: result.boardName, role: result.role } };
  }
  if (body.action === "decline") {
    const ok = await declineInvitation(env, params.id, user.id);
    if (!ok) {
      return apiError(404, "NOT_FOUND", "邀请不存在或已处理");
    }
    return { ok: true, data: { declined: true } };
  }
  return apiError(400, "INVALID_INPUT", "action 需为 accept 或 decline");
}
