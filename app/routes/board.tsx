import { useCallback, useEffect, useRef, useState } from "react";
import { Link, redirect, useNavigate } from "react-router";
import { NoteCard } from "~/components/board/NoteCard";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";
import { jsonApi } from "~/lib/api";
import { subscribeBoard } from "~/lib/pusher";
import type { BoardMemberInfo } from "~/lib/pusher";
import { useBoardStore, screenToWorld } from "~/lib/store";
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
  const containerRef = useRef<HTMLDivElement>(null);

  const setBoardData = useBoardStore((s) => s.setBoardData);
  const resetBoard = useBoardStore((s) => s.resetBoard);
  const notesMap = useBoardStore((s) => s.notes);
  const viewport = useBoardStore((s) => s.viewport);
  const setViewport = useBoardStore((s) => s.setViewport);
  const zoomAt = useBoardStore((s) => s.zoomAt);
  const panBy = useBoardStore((s) => s.panBy);
  const applyPatch = useBoardStore((s) => s.applyPatch);

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
  // 左下角操作提示 (可收起, localStorage 记忆)
  const [hintHidden, setHintHidden] = useState(
    () =>
      typeof localStorage !== "undefined" &&
      localStorage.getItem("board:hint:hidden") === "1",
  );

  const hideHint = useCallback(() => {
    setHintHidden(true);
    localStorage.setItem("board:hint:hidden", "1");
  }, []);

  // 平移与缩放手势状态机
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const panRef = useRef<{ startX: number; startY: number; viewX: number; viewY: number } | null>(null);
  const pinchRef = useRef<{ dist: number; midX: number; midY: number } | null>(null);

  // 手势状态兜底: 失焦/页面隐藏/指针取消时清空, 防止残留 pointerId
  // 使单指拖动被误判为双指缩放 (平移失效不可恢复)
  const resetGestures = useCallback(() => {
    pointersRef.current.clear();
    panRef.current = null;
    pinchRef.current = null;
  }, []);

  useEffect(() => {
    const onCleanup = () => resetGestures();
    window.addEventListener("blur", onCleanup);
    window.addEventListener("pointercancel", onCleanup);
    document.addEventListener("visibilitychange", onCleanup);
    return () => {
      window.removeEventListener("blur", onCleanup);
      window.removeEventListener("pointercancel", onCleanup);
      document.removeEventListener("visibilitychange", onCleanup);
    };
  }, [resetGestures]);

  // 初始化数据与实时订阅
  useEffect(() => {
    // 同路由切换背景板时组件实例复用, 先清空跨板残留状态再载入
    resetBoard();
    setBoardData(notes);
  }, [resetBoard, setBoardData, notes]);

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
  const handleCanvasDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!isEditor) return;
      // 双击是明确的手势边界: 重置指针状态机, 防止残留 pointerId 使
      // 后续单指拖动被误判为双指缩放 (无法平移)
      resetGestures();
      const el = e.target as HTMLElement;
      if (el.closest("[data-note]")) return;
      const vp = useBoardStore.getState().viewport;
      const { wx, wy } = screenToWorld(e.clientX, e.clientY, vp);
      setCreateDraft({ wx, wy });
    },
    [isEditor, resetGestures],
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

  // 平移与缩放手势
  const handlePointerDown = (e: React.PointerEvent) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 1) {
      const vp = useBoardStore.getState().viewport;
      panRef.current = { startX: e.clientX, startY: e.clientY, viewX: vp.viewX, viewY: vp.viewY };
      pinchRef.current = null;
    } else if (pointersRef.current.size === 2) {
      panRef.current = null;
      const [p1, p2] = [...pointersRef.current.values()];
      pinchRef.current = {
        dist: Math.hypot(p1.x - p2.x, p1.y - p2.y),
        midX: (p1.x + p2.x) / 2,
        midY: (p1.y + p2.y) / 2,
      };
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2 && pinchRef.current) {
      const [p1, p2] = [...pointersRef.current.values()];
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      const factor = dist / pinchRef.current.dist;
      if (Number.isFinite(factor) && factor > 0) {
        zoomAt(midX, midY, factor);
      }
      pinchRef.current = { dist, midX, midY };
      return;
    }
    if (panRef.current) {
      // 绝对定位: viewport = 按下时视口 + 当前指针相对起点的偏移。
      // 不能用 panBy 增量累加绝对偏移 (会随 move 次数累积偏差, 且方向切换时行为错误)
      const vp = useBoardStore.getState().viewport;
      const pan = panRef.current;
      setViewport({
        ...vp,
        viewX: pan.viewX + (e.clientX - pan.startX),
        viewY: pan.viewY + (e.clientY - pan.startY),
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 0) panRef.current = null;
  };

  // 缩放/平移滚轮 (原生非 passive 监听, 否则 preventDefault 无效, Ctrl+滚轮会触发浏览器缩放)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.1 : 1 / 1.1);
      } else {
        e.preventDefault();
        panBy(-e.deltaX, -e.deltaY);
      }
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [zoomAt, panBy]);

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
      <header className="absolute top-0 inset-x-0 z-[200] flex items-center gap-3 px-4 py-2.5 bg-white/70 backdrop-blur shadow-sm">
        <Link to="/" className="text-lg hover:text-warm/60">
          ←
        </Link>
        <h1 className="text-lg truncate">{board.name}</h1>
        {!isDefault && (
          <button
            onClick={() =>
              void jsonApi(`/api/boards/${board.id}?action=default`, "POST", {}).then(() =>
                setToast("已设为默认背景板"),
              )
            }
            className="text-warm/40 hover:text-amber-500 text-sm"
            title="设为默认背景板"
          >
            ☆
          </button>
        )}
        {isDefault && <span className="text-amber-500 text-sm" title="默认背景板">★</span>}
        <span
          className={`ml-auto flex items-center gap-1.5 text-sm ${
            connected ? "text-green-600" : "text-warm/50"
          }`}
        >
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              connected ? "bg-green-500" : "bg-warm/40 animate-pulse"
            }`}
          />
          {connected ? "已连接" : "连接中"}
        </span>
        <div className="flex -space-x-2">
          {Object.entries(members)
            .filter(([, m]) => m.name)
            .map(([id, m]) =>
              m.avatarUrl ? (
                <img
                  key={id}
                  src={m.avatarUrl}
                  alt={m.name}
                  title={m.name}
                  className="w-7 h-7 rounded-full border-2 border-white"
                />
              ) : (
                <span
                  key={id}
                  title={m.name}
                  className="w-7 h-7 rounded-full border-2 border-white bg-note flex items-center justify-center text-xs"
                >
                  {m.name.slice(0, 1)}
                </span>
              ),
            )}
        </div>
        {isEditor && (
          <button
            onClick={() => setInviteOpen((v) => !v)}
            className="rounded-xl bg-warm text-white px-3 py-1.5 text-sm hover:opacity-90"
          >
            邀请
          </button>
        )}
        {!isEditor && (
          <span className="rounded-full bg-warm/10 px-3 py-1 text-sm text-warm/70">只读</span>
        )}
      </header>

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

      {/* 画布 */}
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{ touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleCanvasDoubleClick}
      >
        <div
          className="absolute top-0 left-0"
          style={{
            transform: `translate(${viewport.viewX}px, ${viewport.viewY}px) scale(${viewport.scale})`,
            transformOrigin: "0 0",
          }}
        >
          {/* 网格背景 */}
          <GridBackground scale={viewport.scale} />

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
        </div>

        {/* 左下角: 操作提示 (可收起) + 缩放指示 */}
        <div className="absolute bottom-4 left-4 z-[200] flex items-center gap-2">
          {!hintHidden && (
            <div className="flex items-center gap-3 rounded-full bg-white/80 backdrop-blur px-3 py-1.5 text-sm text-warm/70">
              <span className="flex items-center gap-1 whitespace-nowrap">
                <kbd className="rounded border border-warm/20 bg-white px-1 text-xs">Ctrl+滚轮</kbd>
                缩放
              </span>
              <span className="flex items-center gap-1 whitespace-nowrap">
                <kbd className="rounded border border-warm/20 bg-white px-1 text-xs">拖拽</kbd>
                平移
              </span>
              <span className="flex items-center gap-1 whitespace-nowrap">
                <kbd className="rounded border border-warm/20 bg-white px-1 text-xs">双击</kbd>
                新建便笺
              </span>
              <button
                onClick={hideHint}
                className="text-warm/40 hover:text-warm/70 text-xs px-0.5"
                title="隐藏操作提示"
              >
                ✕
              </button>
            </div>
          )}
          <div className="rounded-full bg-white/80 backdrop-blur px-3 py-1 text-sm text-warm/70">
            {Math.round(viewport.scale * 100)}%
          </div>
        </div>
      </div>

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

function GridBackground({ scale }: { scale: number }) {
  const size = 40 * scale;
  return (
    <div
      className="absolute"
      style={{
        width: "100vw",
        height: "100vh",
        backgroundImage:
          "radial-gradient(circle, rgba(120,100,60,0.16) 1px, transparent 1px)",
        backgroundSize: `${size}px ${size}px`,
        transform: "translate(0,0)",
      }}
    />
  );
}
