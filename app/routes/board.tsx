import { useCallback, useEffect, useRef, useState } from "react";
import { Link, redirect, useNavigate } from "react-router";
import { NoteCard } from "~/components/board/NoteCard";
import { LinkLayer, LINK_COLORS } from "~/components/board/LinkLayer";
import { jsonApi } from "~/lib/api";
import { subscribeBoard } from "~/lib/pusher";
import type { BoardMemberInfo } from "~/lib/pusher";
import { useBoardStore } from "~/lib/store";
import type { Note } from "~/lib/types";
import { getSessionUser } from "~/server/auth";
import { getBoardDetail, getUserSettings, listLinks, listNotes } from "~/server/db";
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
  const [notes, links, settings] = await Promise.all([
    listNotes(env, params.boardId),
    listLinks(env, params.boardId),
    getUserSettings(env, user.id),
  ]);
  return {
    board,
    notes,
    links,
    user,
    isEditor: board.role === "editor",
    isDefault: settings.defaultBoardId === board.id,
    pusherKey: env.PUSHER_KEY,
    pusherCluster: env.PUSHER_CLUSTER,
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await getSessionUser(request, env);
  if (!user) {
    return new Response(
      JSON.stringify({ ok: false, error: { code: "UNAUTHORIZED", message: "请先登录" } }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }
  const body = (await request.json().catch(() => ({}))) as { x?: unknown; y?: unknown };
  if (typeof body.x !== "number" || typeof body.y !== "number") {
    return new Response(
      JSON.stringify({ ok: false, error: { code: "INVALID_INPUT", message: "缺少坐标" } }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  const role = await env.DB.prepare(
    `SELECT role FROM board_members WHERE board_id = ? AND user_id = ?`,
  )
    .bind(params.boardId, user.id)
    .first<{ role: string }>();
  if (role?.role !== "editor") {
    return new Response(
      JSON.stringify({ ok: false, error: { code: "FORBIDDEN", message: "观看者无编辑权限" } }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }
  const noteId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO notes (id, board_id, author_id, content, pos_x, pos_y, z_index, width, created_at, updated_at)
     VALUES (?, ?, ?, '', ?, ?, 0, 260, ?, ?)`,
  )
    .bind(params.boardId, user.id, noteId, body.x, body.y, Date.now(), Date.now())
    .run();
  return { ok: true, data: { noteId } };
}

export default function Board({ loaderData }: Route.ComponentProps) {
  const { board, notes, links, user, isEditor, isDefault, pusherKey, pusherCluster } = loaderData;
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  const setBoardData = useBoardStore((s) => s.setBoardData);
  const notesMap = useBoardStore((s) => s.notes);
  const linksMap = useBoardStore((s) => s.links);
  const viewport = useBoardStore((s) => s.viewport);
  const zoomAt = useBoardStore((s) => s.zoomAt);
  const panBy = useBoardStore((s) => s.panBy);
  const dragNote = useBoardStore((s) => s.dragNote);
  const applyPatch = useBoardStore((s) => s.applyPatch);
  const setMembers = useBoardStore((s) => s.setMembers);

  const [members, setMembersLocal] = useState<Record<string, BoardMemberInfo>>({});
  const [connected, setConnected] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteId, setInviteId] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // 初始化数据与实时订阅
  useEffect(() => {
    setBoardData(notes, links);
  }, [setBoardData, notes, links]);

  useEffect(() => {
    const unsubscribe = subscribeBoard(pusherKey, pusherCluster, board.id, {
      onPatch: (patch) => {
        applyPatch(patch);
        if (patch.sender !== user.id) {
          setToast(`${patch.entity === "note" ? "便笺" : "连线"}已更新`);
          setTimeout(() => setToast(null), 1500);
        }
      },
      onMembers: (m) => {
        setMembersLocal((prev) => ({ ...prev, ...m }));
        setMembers(m);
      },
      onMemberAdded: (id, info) => {
        setMembersLocal((prev) => ({ ...prev, [id]: info }));
        setMembers({ [id]: info });
      },
      onMemberRemoved: (id) => {
        setMembersLocal((prev) => {
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

  // 空白处双击创建便笺
  const handleCanvasDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!isEditor) return;
      const vp = useBoardStore.getState().viewport;
      const wx = (e.clientX - vp.viewX) / vp.scale;
      const wy = (e.clientY - vp.viewY) / vp.scale;
      const el = e.target as HTMLElement;
      if (el.closest("[data-note]")) return;
      void jsonApi<{ noteId: string }>("/api/notes", "POST", { boardId: board.id, x: wx, y: wy })
        .then((r) => navigate(`/b/${board.id}/n/${r.noteId}`))
        .catch(() => setToast("创建便笺失败"));
    },
    [isEditor, board.id, navigate],
  );

  // 拖拽提交
  const commitMove = useCallback(
    (noteId: string, x: number, y: number) => {
      void jsonApi(`/api/notes/${noteId}/position`, "PUT", { x, y }).catch(() => {
        setToast("移动保存失败");
      });
    },
    [],
  );

  // 连线创建
  const handleLinkDrop = useCallback(
    (fromNoteId: string, screenX: number, screenY: number) => {
      const vp = useBoardStore.getState().viewport;
      const notesAll = useBoardStore.getState().notes;
      let target: Note | null = null;
      for (const n of Object.values(notesAll)) {
        if (n.id === fromNoteId) continue;
        const pinX = (n.posX + n.width / 2) * vp.scale + vp.viewX;
        const pinY = n.posY * vp.scale + vp.viewY;
        const dist = Math.hypot(pinX - screenX, pinY - screenY);
        if (dist < 32) {
          target = n;
          break;
        }
      }
      if (!target) return;
      void jsonApi("/api/links", "POST", {
        boardId: board.id,
        fromNoteId,
        toNoteId: target.id,
        color: LINK_COLORS[Math.floor(Math.random() * LINK_COLORS.length)],
      }).catch(() => setToast("创建连线失败"));
    },
    [board.id],
  );

  // 平移与缩放手势
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const panRef = useRef<{ startX: number; startY: number; viewX: number; viewY: number } | null>(null);
  const pinchRef = useRef<{ dist: number; midX: number; midY: number } | null>(null);

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
      panBy(e.clientX - panRef.current.startX, e.clientY - panRef.current.startY);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 0) panRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.1 : 1 / 1.1);
    } else {
      panBy(-e.deltaX, -e.deltaY);
    }
  };

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
          {Object.values(members)
            .filter((m) => m.name)
            .map((m, i) =>
              m.avatarUrl ? (
                <img
                  key={i}
                  src={m.avatarUrl}
                  alt={m.name}
                  title={m.name}
                  className="w-7 h-7 rounded-full border-2 border-white"
                />
              ) : (
                <span
                  key={i}
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
        onWheel={handleWheel}
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
                onLinkDrop={handleLinkDrop}
              />
            </div>
          ))}
        </div>

        {/* 连线层 (屏幕坐标) */}
        <LinkLayer notes={notesMap} links={linksMap} isEditor={isEditor} />

        {/* 蓝色拖拽 mask */}
        {dragNote && (
          <DragPreview note={notesMap[dragNote.noteId]} x={dragNote.previewX} y={dragNote.previewY} />
        )}

        {/* 缩放指示 */}
        <div className="absolute bottom-4 left-4 z-[200] rounded-full bg-white/80 backdrop-blur px-3 py-1 text-sm text-warm/70">
          {Math.round(viewport.scale * 100)}%
        </div>
      </div>

      {toast && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[300] rounded-full bg-warm text-white px-4 py-2 text-sm shadow-lg">
          {toast}
        </div>
      )}
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

function DragPreview({
  note,
  x,
  y,
}: {
  note: Note | undefined;
  x: number;
  y: number;
}) {
  const viewport = useBoardStore((s) => s.viewport);
  if (!note) return null;
  return (
    <div
      className="absolute pointer-events-none rounded-md bg-blue-500/20 border-2 border-blue-500"
      style={{
        left: x * viewport.scale + viewport.viewX,
        top: y * viewport.scale + viewport.viewY,
        width: note.width * viewport.scale,
        height: 200 * viewport.scale,
      }}
    />
  );
}
