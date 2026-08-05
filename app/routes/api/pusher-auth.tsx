import { requireUser } from "~/server/auth";
import { authorizeChannel } from "~/server/pusher";
import { BOARD_CHANNEL_PREFIX } from "~/lib/constants";
import type { Route } from "./+types/pusher-auth";

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "不支持的请求方法" } }),
      { status: 405, headers: { "Content-Type": "application/json" } },
    );
  }
  const form = await request.formData();
  const socketId = String(form.get("socket_id") ?? "");
  const channelName = String(form.get("channel_name") ?? "");
  if (!socketId || !channelName) {
    return new Response("缺少参数", { status: 400 });
  }
  // 背景板 ID 从频道名解析 (客户端不再传 boardId 参数; channel_name 由
  // pusher-js 自动携带, 服务端以此为准, 校验成员关系)
  if (!channelName.startsWith(BOARD_CHANNEL_PREFIX)) {
    return new Response("频道不合法", { status: 400 });
  }
  const boardId = channelName.slice(BOARD_CHANNEL_PREFIX.length);
  const role = await env.DB.prepare(
    `SELECT role FROM board_members WHERE board_id = ? AND user_id = ?`,
  )
    .bind(boardId, user.id)
    .first<{ role: string }>();
  if (!role) {
    return new Response("无权订阅该频道", { status: 403 });
  }
  const auth = authorizeChannel(env, socketId, channelName, {
    user_id: user.id,
    user_info: { name: user.name, avatarUrl: user.avatarUrl },
  });
  return new Response(JSON.stringify(auth), {
    headers: { "Content-Type": "application/json" },
  });
}
