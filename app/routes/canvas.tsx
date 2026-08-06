import { useCallback, useEffect, useRef, useState } from "react";
import { redirect } from "react-router";
import { CanvasBoard } from "~/components/canvas/CanvasBoard";
import { TextBlock, type TextBlockHandle } from "~/components/canvas/TextBlock";
import { BoardHeader } from "~/components/shared/BoardHeader";
import { StickerPicker } from "~/components/ui/StickerPicker";
import { jsonApi } from "~/lib/api";
import { useCanvasStore } from "~/lib/canvas";
import { useBlockStore } from "~/lib/blockStore";
import { subscribeBoard } from "~/lib/pusher";
import type { BoardMemberInfo } from "~/lib/pusher";
import type { AlignH, AlignV, Block } from "~/lib/types";
import { getSessionUser } from "~/server/auth";
import { getBoardDetail, getUserSettings, listBlocks } from "~/server/db";
import type { Route } from "./+types/canvas";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await getSessionUser(request, env);
  if (!user) {
    return redirect(`/auth/login?returnTo=/c/${params.boardId}`);
  }
  const board = await getBoardDetail(env, params.boardId, user.id);
  if (!board) {
    throw new Response(
      JSON.stringify({ ok: false, error: { code: "FORBIDDEN", message: "你不是该背景板的成员" } }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }
  const [blocks, settings] = await Promise.all([
    listBlocks(env, params.boardId),
    getUserSettings(env, user.id),
  ]);
  return {
    board,
    blocks,
    user,
    isEditor: board.role === "editor",
    isDefault: settings.defaultBoardId === board.id,
    pusherKey: env.PUSHER_KEY,
    pusherCluster: env.PUSHER_CLUSTER,
  };
}

export default function CanvasBoardRoute({ loaderData }: Route.ComponentProps) {
  const { board, blocks, user, isEditor, isDefault, pusherKey, pusherCluster } = loaderData;

  const setBlockData = useBlockStore((s) => s.setBlockData);
  const resetBlocks = useBlockStore((s) => s.resetBlocks);
  const upsertBlock = useBlockStore((s) => s.upsertBlock);
  const removeBlock = useBlockStore((s) => s.removeBlock);
  const blocksMap = useBlockStore((s) => s.blocks);
  const applyPatch = useBlockStore((s) => s.applyPatch);
  const resetViewport = useCanvasStore((s) => s.resetViewport);

  const [members, setMembers] = useState<Record<string, BoardMemberInfo>>({});
  const [connected, setConnected] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteId, setInviteId] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // 选中 / 编辑中的文本块 (同时只允许一个)
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [stickerOpen, setStickerOpen] = useState(false);
  // 编辑态 TextBlock 句柄 (表情插入到光标处)
  const blockRefs = useRef(new Map<string, TextBlockHandle>());

  useEffect(() => {
    resetBlocks();
    resetViewport();
    setBlockData(blocks);
  }, [resetBlocks, resetViewport, setBlockData, blocks]);

  useEffect(() => {
    const unsubscribe = subscribeBoard(pusherKey, pusherCluster, board.id, {
      onPatch: (patch) => {
        applyPatch(patch);
        if (patch.sender !== user.id) {
          setToast("画布已更新");
          setTimeout(() => setToast(null), 1500);
        }
      },
      onMembers: (m) => setMembers((prev) => ({ ...prev, ...m })),
      onMemberAdded: (id, info) => setMembers((prev) => ({ ...prev, [id]: info })),
      onMemberRemoved: (id) =>
        setMembers((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        }),
      onConnected: () => setConnected(true),
      onDisconnected: () => setConnected(false),
    });
    return unsubscribe;
  }, [board.id, pusherKey, pusherCluster, user.id, applyPatch]);

  // 双击空白 → 直接创建文本块并进入编辑 (无需确认弹窗)
  const handleBlankDoubleClick = useCallback(
    (_e: React.MouseEvent, world: { wx: number; wy: number }) => {
      if (!isEditor) return;
      void jsonApi<{ block: Block }>("/api/blocks", "POST", {
        boardId: board.id,
        x: world.wx,
        y: world.wy,
      })
        .then((r) => {
          if (r.block) {
            upsertBlock(r.block);
            setSelectedId(r.block.id);
            setEditingId(r.block.id);
          }
        })
        .catch(() => setToast("创建文本块失败"));
    },
    [isEditor, board.id, upsertBlock],
  );

  // 提交文本: 空内容视为删除; 编辑结束时保存
  const commitText = useCallback(
    (id: string, text: string) => {
      setEditingId(null);
      if (!isEditor) return;
      const current = blocksMap[id];
      if (!current) return;
      if (text.trim() === "") {
        removeBlock(id);
        setSelectedId(null);
        void jsonApi(`/api/blocks/${id}`, "DELETE").catch(() => {
          upsertBlock(current);
          setToast("删除失败");
        });
        return;
      }
      upsertBlock({ ...current, text });
      void jsonApi<{ block: Block }>(`/api/blocks/${id}`, "PATCH", { text })
        .then((r) => {
          if (r.block) upsertBlock(r.block);
        })
        .catch(() => setToast("保存失败"));
    },
    [isEditor, blocksMap, removeBlock, upsertBlock],
  );

  const commitMove = useCallback(
    (id: string, x: number, y: number) => {
      const current = blocksMap[id];
      if (current) upsertBlock({ ...current, posX: x, posY: y });
      void jsonApi<{ block: Block }>(`/api/blocks/${id}/position`, "PUT", { x, y })
        .then((r) => {
          if (r.block) upsertBlock(r.block);
        })
        .catch(() => setToast("移动保存失败"));
    },
    [blocksMap, upsertBlock],
  );

  const commitAlign = useCallback(
    (id: string, h: AlignH, v: AlignV) => {
      const current = blocksMap[id];
      if (!current) return;
      upsertBlock({ ...current, alignH: h, alignV: v });
      void jsonApi<{ block: Block }>(`/api/blocks/${id}`, "PATCH", { alignH: h, alignV: v })
        .then((r) => {
          if (r.block) upsertBlock(r.block);
        })
        .catch(() => setToast("对齐保存失败"));
    },
    [blocksMap, upsertBlock],
  );

  const deleteBlock = useCallback(
    (id: string) => {
      const current = blocksMap[id];
      removeBlock(id);
      setSelectedId(null);
      setEditingId(null);
      void jsonApi(`/api/blocks/${id}`, "DELETE").catch(() => {
        if (current) upsertBlock(current);
        setToast("删除失败");
      });
    },
    [blocksMap, removeBlock, upsertBlock],
  );

  // 图片上传 (粘贴图片): 复用 /api/images (权限按 boardId 校验)
  const uploadImage = useCallback(
    async (file: File): Promise<string> => {
      if (!file.type.startsWith("image/")) throw new Error("不是图片");
      const form = new FormData();
      form.append("file", file);
      form.append("boardId", board.id);
      form.append("noteId", "draft");
      const res = await fetch("/api/images", { method: "POST", body: form });
      const body = (await res.json()) as {
        ok?: boolean;
        data?: { image?: { url: string } };
        error?: { message?: string };
      };
      if (!res.ok || !body.data?.image)
        throw new Error(body.error?.message ?? "上传失败");
      return body.data.image.url;
    },
    [board.id],
  );

  // 表情: 打开选择器前确保目标块处于编辑态 (插入到光标处)
  const openSticker = useCallback(() => {
    setStickerOpen(true);
  }, []);
  const handleStickerPick = useCallback(
    (url: string) => {
      setStickerOpen(false);
      const handle = editingId ? blockRefs.current.get(editingId) : null;
      if (handle) handle.insertImageAtCursor(url);
    },
    [editingId],
  );

  const sendInvite = async () => {
    setInviteMsg(null);
    try {
      await jsonApi("/api/invitations", "POST", {
        boardId: board.id,
        inviteeId: inviteId,
        role: inviteRole,
      });
      setInviteMsg("邀请已发送 ✓");
      setInviteId("");
    } catch (err) {
      setInviteMsg(err instanceof Error ? err.message : "发送失败");
    }
  };

  const sortedBlocks = Object.values(blocksMap).sort(
    (a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0),
  );

  return (
    <div className="h-screen w-screen overflow-hidden relative bg-board">
      <BoardHeader
        backTo="/"
        name={board.name}
        connected={connected}
        members={members}
        isEditor={isEditor}
        onInviteClick={() => setInviteOpen((v) => !v)}
        defaultStar={{
          isDefault,
          canSet: !isDefault,
          onSet: () =>
            void jsonApi(`/api/boards/${board.id}?action=default`, "POST", {}).then(() =>
              setToast("已设为默认背景板"),
            ),
        }}
      >
        {isEditor && (
          <span className="rounded-full bg-board/60 px-2.5 py-1 text-xs text-warm/70">
            双击空白新建文本块
          </span>
        )}
      </BoardHeader>

      {/* 邀请面板 */}
      {inviteOpen && (
        <div className="absolute top-14 right-4 z-[200] w-72 rounded-2xl bg-white shadow-xl p-4">
          <h3 className="text-lg mb-2">邀请协作者</h3>
          <input
            value={inviteId}
            onChange={(e) => setInviteId(e.target.value)}
            placeholder="对方用户 ID"
            className="w-full rounded-xl bg-board/60 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300"
          />
          <div className="flex gap-2 mt-2">
            {(["editor", "viewer"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setInviteRole(r)}
                className={`flex-1 rounded-xl py-1.5 text-sm ${
                  inviteRole === r ? "bg-warm text-white" : "bg-board/60"
                }`}
              >
                {r === "editor" ? "编辑者" : "观看者"}
              </button>
            ))}
          </div>
          <button
            onClick={sendInvite}
            className="mt-2 w-full rounded-xl bg-warm text-white py-2 hover:opacity-90"
          >
            发送邀请
          </button>
          {inviteMsg && <p className="mt-2 text-sm text-warm/70">{inviteMsg}</p>}
        </div>
      )}

      {/* 无限画布 */}
      <CanvasBoard
        hintKey="canvas:hint:hidden"
        hintItems={[
          { kbd: "Ctrl+滚轮", text: "缩放" },
          { kbd: "拖拽", text: "平移" },
          { kbd: "双击", text: "新建文本块" },
        ]}
        onBlankDoubleClick={handleBlankDoubleClick}
        onBlankClick={() => {
          setSelectedId(null);
        }}
      >
        {sortedBlocks.map((block) => (
          <TextBlock
            key={block.id}
            ref={(h) => {
              if (h) blockRefs.current.set(block.id, h);
              else blockRefs.current.delete(block.id);
            }}
            block={block}
            isEditor={isEditor}
            selected={selectedId === block.id}
            editing={editingId === block.id}
            onSelect={() => setSelectedId(block.id)}
            onStartEdit={() => {
              setSelectedId(block.id);
              setEditingId(block.id);
            }}
            onCommitText={commitText}
            onCommitMove={commitMove}
            onCommitAlign={commitAlign}
            onDelete={deleteBlock}
            onUploadImage={uploadImage}
            onOpenSticker={openSticker}
          />
        ))}
      </CanvasBoard>

      {toast && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[300] rounded-full bg-warm text-white px-4 py-2 text-sm shadow-lg">
          {toast}
        </div>
      )}

      {/* 表情选择器 */}
      {stickerOpen && (
        <StickerPicker
          boardId={board.id}
          onPick={handleStickerPick}
          onClose={() => setStickerOpen(false)}
        />
      )}
    </div>
  );
}
