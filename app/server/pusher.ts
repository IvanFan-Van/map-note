import Pusher from "pusher";

export function createPusher(env: Env): Pusher {
  return new Pusher({
    appId: env.PUSHER_APP_ID,
    key: env.PUSHER_KEY,
    secret: env.PUSHER_SECRET,
    cluster: env.PUSHER_CLUSTER,
    useTLS: true,
  });
}

export function boardChannel(boardId: string): string {
  return `presence-board-${boardId}`;
}

export const PATCH_EVENT = "board:patch";
