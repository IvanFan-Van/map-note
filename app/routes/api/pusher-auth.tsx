import { requireUser } from "~/server/auth";
import { boardChannel, createPusher } from "~/server/pusher";
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
  const boardId = String(form.get("boardId") ?? "");
  if (!socketId || !channelName) {
    return new Response("缺少参数", { status: 400 });
  }
  const match = channelName.match(/^presence-board-(.+)$/);
  if (!match || match[1] !== boardId || boardChannel(boardId) !== channelName) {
    return new Response("频道不合法", { status: 400 });
  }
  const role = await env.DB.prepare(
    `SELECT role FROM board_members WHERE board_id = ? AND user_id = ?`,
  )
    .bind(boardId, user.id)
    .first<{ role: string }>();
  if (!role) {
    return new Response("无权订阅该频道", { status: 403 });
  }
  const pusher = createPusher(env);
  const auth = pusher.authorizeChannel(socketId, channelName, {
    user_id: user.id,
    user_info: { name: user.name, avatarUrl: user.avatarUrl },
  });
  return new Response(JSON.stringify(auth), {
    headers: { "Content-Type": "application/json" },
  });
}
