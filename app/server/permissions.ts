import { getBoardRole } from "~/server/db";
import type { PatchEvent } from "~/lib/types";
import { boardChannel, createPusher, PATCH_EVENT } from "~/server/pusher";

export async function assertMember(env: Env, boardId: string, userId: string) {
  const role = await getBoardRole(env, boardId, userId);
  if (!role) {
    throw new Response(
      JSON.stringify({ ok: false, error: { code: "FORBIDDEN", message: "你不是该背景板的成员" } }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }
  return role;
}

export async function assertEditor(env: Env, boardId: string, userId: string) {
  const role = await getBoardRole(env, boardId, userId);
  if (role !== "editor") {
    throw new Response(
      JSON.stringify({ ok: false, error: { code: "FORBIDDEN", message: role === "viewer" ? "观看者无编辑权限" : "你不是该背景板的成员" } }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }
  return role;
}

export function broadcastPatch(env: Env, boardId: string, patch: PatchEvent): void {
  const pusher = createPusher(env);
  pusher
    .trigger(boardChannel(boardId), PATCH_EVENT, patch)
    .catch((err) => console.error("[pusher] trigger failed:", err));
}
