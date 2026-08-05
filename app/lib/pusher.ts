import Pusher from "pusher-js";
import type { PatchEvent } from "~/lib/types";
import { BOARD_CHANNEL_PREFIX, PATCH_EVENT } from "~/lib/constants";

let pusher: Pusher | null = null;

export interface BoardMemberInfo {
  name: string;
  avatarUrl: string | null;
}

// 注意: 模块级单例 — 订阅不同背景板时复用同一连接。
// auth 不带 boardId 参数: 服务端从 channel_name (presence-board-<id>) 解析,
// 固化 boardId 会导致切换背景板后 auth 参数陈旧、订阅 403。
export function initPusher(key: string, cluster: string) {
  if (!pusher) {
    pusher = new Pusher(key, {
      cluster,
      authEndpoint: "/api/pusher/auth",
    });
  }
  return pusher;
}

export interface BoardChannelHandlers {
  onPatch: (patch: PatchEvent) => void;
  onMembers: (members: Record<string, BoardMemberInfo>) => void;
  onMemberAdded: (id: string, info: BoardMemberInfo) => void;
  onMemberRemoved: (id: string) => void;
  onConnected: () => void;
  onDisconnected: () => void;
}

export function subscribeBoard(
  key: string,
  cluster: string,
  boardId: string,
  handlers: BoardChannelHandlers,
): () => void {
  const p = initPusher(key, cluster);
  const channelName = `${BOARD_CHANNEL_PREFIX}${boardId}`;
  const channel = p.subscribe(channelName);

  channel.bind(PATCH_EVENT, handlers.onPatch);
  channel.bind("pusher:subscription_succeeded", (members: { members: Record<string, BoardMemberInfo> }) => {
    handlers.onMembers(members.members);
    handlers.onConnected();
  });
  channel.bind("pusher:member_added", (m: { id: string; info: BoardMemberInfo }) => {
    handlers.onMemberAdded(m.id, m.info);
  });
  channel.bind("pusher:member_removed", (m: { id: string }) => {
    handlers.onMemberRemoved(m.id);
  });

  const onStateChange = (states: { current: string; previous: string }) => {
    if (states.current === "connected") handlers.onConnected();
    if (states.current === "disconnected") handlers.onDisconnected();
  };
  p.connection.bind("state_change", onStateChange);

  return () => {
    p.connection.unbind("state_change", onStateChange);
    channel.unbind_all();
    p.unsubscribe(channelName);
  };
}
