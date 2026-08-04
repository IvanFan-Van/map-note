import { hmac } from "@noble/hashes/hmac.js";
import { md5 } from "@noble/hashes/legacy.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

export function boardChannel(boardId: string): string {
  return `presence-board-${boardId}`;
}

export const PATCH_EVENT = "board:patch";

/**
 * Pusher 服务端触发 (纯 fetch 实现)。
 * 不用官方 `pusher` npm 包: 其底层使用 node:http, 在 Workers/workerd 的
 * nodejs_compat 兼容层下会崩溃 (Cannot read properties of null (reading 'has'))。
 * 直接调用 Pusher HTTP REST API, 需要实现 body_md5 + auth_signature 签名。
 */
export async function triggerPusher(
  env: Env,
  channel: string,
  event: string,
  data: unknown,
): Promise<void> {
  const body = JSON.stringify(data);
  const bodyMd5 = bytesToHex(md5(new TextEncoder().encode(body)));
  const timestamp = Math.floor(Date.now() / 1000);
  const queryBase = `auth_key=${encodeURIComponent(env.PUSHER_KEY)}&auth_timestamp=${timestamp}&auth_version=1.0&body_md5=${bodyMd5}`;
  const stringToSign = `POST\n/apps/${env.PUSHER_APP_ID}/events\n${queryBase}`;
  const signature = bytesToHex(
    hmac(sha256, new TextEncoder().encode(env.PUSHER_SECRET), new TextEncoder().encode(stringToSign)),
  );
  const url = `https://api-${env.PUSHER_CLUSTER}.pusher.com/apps/${env.PUSHER_APP_ID}/events?${queryBase}&auth_signature=${signature}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: event,
      channels: [channel],
      data: body,
    }),
  });
  if (!res.ok) {
    throw new Error(`Pusher trigger failed: ${res.status} ${await res.text()}`);
  }
}

/**
 * Pusher 频道订阅鉴权签名 (presence 频道)。
 * 生成 { auth, channel_data }, 供客户端订阅时使用。
 */
export function authorizeChannel(
  env: Env,
  socketId: string,
  channelName: string,
  userData: { user_id: string; user_info: unknown },
): { auth: string; channel_data: string } {
  const channelData = JSON.stringify(userData);
  const stringToSign = `${socketId}:${channelName}:${channelData}`;
  const signature = bytesToHex(
    hmac(sha256, new TextEncoder().encode(env.PUSHER_SECRET), new TextEncoder().encode(stringToSign)),
  );
  return {
    auth: `${env.PUSHER_KEY}:${signature}`,
    channel_data: channelData,
  };
}