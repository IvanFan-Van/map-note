import { requireUser } from "~/server/auth";
import { createInvitation, getBoardDetail, getBoardRole } from "~/server/db";
import type { Route } from "./+types/invitations";

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
    inviteeId?: unknown;
    role?: unknown;
  };
  const boardId = String(body.boardId ?? "");
  const inviteeId = String(body.inviteeId ?? "").trim();
  const role = body.role === "viewer" ? "viewer" : "editor";
  if (!boardId || !inviteeId) {
    return new Response(
      JSON.stringify({ ok: false, error: { code: "INVALID_INPUT", message: "缺少参数" } }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  const roleOfInviter = await getBoardRole(env, boardId, user.id);
  if (roleOfInviter !== "editor") {
    return new Response(
      JSON.stringify({ ok: false, error: { code: "FORBIDDEN", message: "仅编辑者可发起邀请" } }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }
  if (inviteeId === user.id) {
    return new Response(
      JSON.stringify({ ok: false, error: { code: "INVALID_INPUT", message: "不能邀请自己" } }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  const invitee = await env.DB.prepare(`SELECT id FROM users WHERE id = ?`)
    .bind(inviteeId)
    .first<{ id: string }>();
  if (!invitee) {
    return new Response(
      JSON.stringify({ ok: false, error: { code: "NOT_FOUND", message: "用户不存在, 请核对用户 ID" } }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }
  const already = await getBoardRole(env, boardId, inviteeId);
  if (already) {
    return new Response(
      JSON.stringify({ ok: false, error: { code: "ALREADY_MEMBER", message: "对方已是该背景板成员" } }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  const board = await getBoardDetail(env, boardId, user.id);
  const invitation = await createInvitation(env, boardId, user.id, inviteeId, role);
  if (!invitation) {
    return new Response(
      JSON.stringify({ ok: false, error: { code: "DUPLICATE", message: "已有一份待处理的邀请" } }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  return { ok: true, data: { invitation, boardName: board?.name } };
}
