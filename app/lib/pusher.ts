import Pusher from "pusher-js";
import type { PatchEvent } from "~/lib/types";

let pusher: Pusher | null = null;

export interface BoardMemberInfo {
  name: string;
  avatarUrl: string | null;
}

export function initPusher(key: string, cluster: string, boardId: string) {
  if (!pusher) {
    pusher = new Pusher(key, {
      cluster,
      authEndpoint: "/api/pusher/auth",
      auth: { params: { boardId } },
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
  const p = initPusher(key, cluster, boardId);
  const channelName = `presence-board-${boardId}`;
  const channel = p.subscribe(channelName);

  channel.bind("board:patch", handlers.onPatch);
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
