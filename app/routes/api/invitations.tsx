import { apiError } from "~/lib/api";
import { requireUser } from "~/server/auth";
import { createInvitation, getBoardDetail, getBoardRole } from "~/server/db";
import type { Route } from "./+types/invitations";

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  if (request.method !== "POST") {
    return apiError(405, "METHOD_NOT_ALLOWED", "不支持的请求方法");
  }
  const body = (await request.json().catch(() => ({}))) as {
    boardId?: unknown;
    inviteeId?: unknown;
    role?: unknown;
  };
  const boardId = String(body.boardId ?? "");
  const inviteeId = String(body.inviteeId ?? "").trim();
  const role = body.role === "viewer" ? "viewer" : "editor";
  if (!boardId || !inviteeId) {
    return apiError(400, "INVALID_INPUT", "缺少参数");
  }
  const roleOfInviter = await getBoardRole(env, boardId, user.id);
  if (roleOfInviter !== "editor") {
    return apiError(403, "FORBIDDEN", "仅编辑者可发起邀请");
  }
  if (inviteeId === user.id) {
    return apiError(400, "INVALID_INPUT", "不能邀请自己");
  }
  const invitee = await env.DB.prepare(`SELECT id FROM users WHERE id = ?`)
    .bind(inviteeId)
    .first<{ id: string }>();
  if (!invitee) {
    return apiError(404, "NOT_FOUND", "用户不存在, 请核对用户 ID");
  }
  const already = await getBoardRole(env, boardId, inviteeId);
  if (already) {
    return apiError(400, "ALREADY_MEMBER", "对方已是该背景板成员");
  }
  const board = await getBoardDetail(env, boardId, user.id);
  const invitation = await createInvitation(env, boardId, user.id, inviteeId, role);
  if (!invitation) {
    return apiError(400, "DUPLICATE", "已有一份待处理的邀请");
  }
  return { ok: true, data: { invitation, boardName: board?.name } };
}
