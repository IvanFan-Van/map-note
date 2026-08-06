import { useCallback, useEffect, useState } from "react";
import { redirect, useNavigate } from "react-router";
import { NoteCard } from "~/components/board/NoteCard";
import { CanvasBoard } from "~/components/canvas/CanvasBoard";
import { BoardHeader } from "~/components/shared/BoardHeader";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";
import { jsonApi } from "~/lib/api";
import { useCanvasStore } from "~/lib/canvas";
import { subscribeBoard } from "~/lib/pusher";
import type { BoardMemberInfo } from "~/lib/pusher";
import { useBoardStore } from "~/lib/store";
import type { Note } from "~/lib/types";
import { getSessionUser } from "~/server/auth";
import { getBoardDetail, getUserSettings, listNotes } from "~/server/db";
import type { Route } from "./+types/board";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await getSessionUser(request, env);
  if (!user) {
    return redirect(`/auth/login?returnTo=/b/${params.boardId}`);
  }
  const board = await getBoardDetail(env, params.boardId, user.id);
  if (!board) {
    throw new Response(
      JSON.stringify({ ok: false, error: { code: "FORBIDDEN", message: "你不是该背景板的成员" } }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }
  const [notes, settings] = await Promise.all([
    listNotes(env, params.boardId),
    getUserSettings(env, user.id),
  ]);
  return {
    board,
    notes,
    user,
    isEditor: board.role === "editor",
    isDefault: settings.defaultBoardId === board.id,
    pusherKey: env.PUSHER_KEY,
    pusherCluster: env.PUSHER_CLUSTER,
  };
}

export default function Board({ loaderData }: Route.ComponentProps) {
  const { board, notes, user, isEditor, isDefault, pusherKey, pusherCluster } = loaderData;
  const navigate = useNavigate();

  const setBoardData = useBoardStore((s) => s.setBoardData);
  const resetBoard = useBoardStore((s) => s.resetBoard);
  const notesMap = useBoardStore((s) => s.notes);
  const applyPatch = useBoardStore((s) => s.applyPatch);
  const resetViewport = useCanvasStore((s) => s.resetViewport);

  const [members, setMembers] = useState<Record<string, BoardMemberInfo>>({});
  const [connected, setConnected] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteId, setInviteId] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // 双击新建便笺的确认草稿 (世界坐标); 非阻塞确认, 避免 window.confirm
  // 冻结事件循环导致指针 down/up 失衡、手势状态机残留 (无法平移)
  const [createDraft, setCreateDraft] = useState<{ wx: number; wy: number } | null>(null);
  // 删除便笺的确认草稿 (弹窗渲染在页面级, 避免 world 层 transform 缩放)
  const [deleteDraft, setDeleteDraft] = useState<Note | null>(null);

  // 初始化数据与实时订阅
  useEffect(() => {
    // 同路由切换背景板时组件实例复用, 先清空跨板残留状态再载入
    resetBoard();
    resetViewport();
    setBoardData(notes);
  }, [resetBoard, resetViewport, setBoardData, notes]);

  useEffect(() => {
    const unsubscribe = subscribeBoard(pusherKey, pusherCluster, board.id, {
      onPatch: (patch) => {
        applyPatch(patch);
        if (patch.sender !== user.id) {
          setToast("便笺已更新");
          setTimeout(() => setToast(null), 1500);
        }
      },
      onMembers: (m) => {
        setMembers((prev) => ({ ...prev, ...m }));
      },
      onMemberAdded: (id, info) => {
        setMembers((prev) => ({ ...prev, [id]: info }));
      },
      onMemberRemoved: (id) => {
        setMembers((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      },
      onConnected: () => setConnected(true),
      onDisconnected: () => setConnected(false),
    });
    return unsubscribe;
  }, [board.id, pusherKey, pusherCluster, user.id, applyPatch, setMembers]);

  // 空白处双击创建便笺 (非阻塞确认; 创建后不跳转, 留在画布)
  // 双击是明确的手势边界: 重置指针状态机, 防止残留 pointerId 使
  // 后续单指拖动被误判为双指缩放 (无法平移)
  const handleBlankDoubleClick = useCallback(
    (_e: React.MouseEvent, world: { wx: number; wy: number }) => {
      if (!isEditor) return;
      setCreateDraft({ wx: world.wx, wy: world.wy });
    },
    [isEditor],
  );

  const confirmCreate = () => {
    if (!createDraft) return;
    const draft = createDraft;
    setCreateDraft(null);
    // 用响应数据直接插入便笺 (服务端权威), 不依赖 Pusher 广播回环 —
    // 广播是 fire-and-forget, 可能丢失导致便笺不立即显示
    void jsonApi<{ note: Note }>("/api/notes", "POST", {
      boardId: board.id,
      x: draft.wx,
      y: draft.wy,
    })
      .then((r) => {
        if (r.note) upsertNote(r.note);
      })
      .catch(() => setToast("创建便笺失败"));
  };

  // 删除便笺: 乐观移除 + DELETE + 失败回滚
  const confirmDeleteNote = () => {
    if (!deleteDraft) return;
    const note = deleteDraft;
    setDeleteDraft(null);
    const current = useBoardStore.getState().notes[note.id];
    removeNote(note.id);
    void jsonApi(`/api/notes/${note.id}`, "DELETE").catch(() => {
      if (current) upsertNote(current);
    });
  };

  // 拖拽提交: 先乐观放置本地, PUT 成功后用服务端返回值校准,
  // 不依赖 Pusher 回环 (订阅/触发失败时放置仍生效)
  const upsertNote = useBoardStore((s) => s.upsertNote);
  const removeNote = useBoardStore((s) => s.removeNote);
  const commitMove = useCallback(
    (noteId: string, x: number, y: number) => {
      const current = useBoardStore.getState().notes[noteId];
      if (current) upsertNote({ ...current, posX: x, posY: y });
      void jsonApi<{ note: Note }>(`/api/notes/${noteId}/position`, "PUT", { x, y })
        .then((r) => {
          if (r.note) upsertNote(r.note);
        })
        .catch(() => setToast("移动保存失败"));
    },
    [upsertNote],
  );

  const openNote = useCallback(
    (note: Note) => navigate(`/b/${board.id}/n/${note.id}`),
    [board.id, navigate],
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

  const sortedNotes = Object.values(notesMap).sort(
    (a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0),
  );

  return (
    <div className="h-screen w-screen overflow-hidden relative bg-board">
      {/* 顶部工具栏 */}
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
      />

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

      {/* 画布 (通用 CanvasBoard: 平移/缩放/手势/网格/左下角提示) */}
      <CanvasBoard
        hintKey="board:hint:hidden"
        onBlankDoubleClick={handleBlankDoubleClick}
      >
        {sortedNotes.map((note) => (
          <div key={note.id} data-note>
            <NoteCard
              note={note}
              isEditor={isEditor}
              onClick={openNote}
              onMoveCommit={commitMove}
              onRequestDelete={setDeleteDraft}
            />
          </div>
        ))}
      </CanvasBoard>

      {toast && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[300] rounded-full bg-warm text-white px-4 py-2 text-sm shadow-lg">
          {toast}
        </div>
      )}

      {/* 确认弹窗 (非阻塞, 统一 UI) */}
      <ConfirmDialog
        open={!!createDraft}
        message="在当前位置新建一张便笺?"
        confirmLabel="创建"
        onConfirm={confirmCreate}
        onCancel={() => setCreateDraft(null)}
      />
      <ConfirmDialog
        open={!!deleteDraft}
        message="删除这张便笺?"
        confirmLabel="删除"
        danger
        onConfirm={confirmDeleteNote}
        onCancel={() => setDeleteDraft(null)}
      />
    </div>
  );
}
