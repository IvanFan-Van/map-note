import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useFetcher, useNavigate, useRevalidator, useSearchParams } from "react-router";
import { jsonApi } from "~/lib/api";
import type { BoardSummary, Invitation } from "~/lib/types";
import { getSessionUser } from "~/server/auth";
import { createBoard, getUserSettings, listBoardsForUser } from "~/server/db";
import type { Route } from "./+types/home";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await getSessionUser(request, env);
  if (!user) {
    return { user: null, boards: [] as BoardSummary[], defaultBoardId: null };
  }
  const [boards, settings] = await Promise.all([
    listBoardsForUser(env, user.id),
    getUserSettings(env, user.id),
  ]);
  return { user, boards, defaultBoardId: settings.defaultBoardId };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await getSessionUser(request, env);
  if (!user) {
    return { ok: false, error: "请先登录" };
  }
  const body = (await request.json().catch(() => ({}))) as { name?: unknown };
  const name =
    typeof body.name === "string" && body.name.trim()
      ? body.name.trim().slice(0, 30)
      : "我的生活";
  const board = await createBoard(env, user.id, name);
  return { ok: true, board };
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (sameDay) return `今天 ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `昨天 ${time}`;
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { user, boards, defaultBoardId } = loaderData;

  if (!user) {
    return <LoginGate />;
  }
  return <BoardsView user={user} boards={boards} defaultBoardId={defaultBoardId} />;
}

function LoginGate() {
  const [searchParams] = useSearchParams();
  const loginError = searchParams.get("login_error");
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 px-6">
      <div className="text-center space-y-3">
        <h1 className="text-6xl" style={{ fontFamily: "Patrick Hand, LeMiXiaoNaiPaoTi" }}>
          co-note
        </h1>
        <p className="text-xl text-warm/70">一块自由钉便笺的共享桌面</p>
      </div>
      <Link
        to="/auth/login"
        className="inline-flex items-center gap-3 rounded-xl bg-white px-6 py-3 text-lg shadow-md hover:shadow-lg transition-shadow"
      >
        <GoogleIcon />
        使用 Google 登录
      </Link>
      {loginError && (
        <p className="text-sm text-red-500">登录失败, 请重试。</p>
      )}
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

function BoardsView({
  user,
  boards,
  defaultBoardId: defaultBoardIdInitial,
}: {
  user: NonNullable<Route.ComponentProps["loaderData"]["user"]>;
  boards: BoardSummary[];
  defaultBoardId: string | null;
}) {
  const fetcher = useFetcher<{ ok: boolean; board?: BoardSummary }>();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [defaultBoardId, setDefaultBoardId] = useState<string | null>(defaultBoardIdInitial);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadInbox = useCallback(async () => {
    setInboxLoading(true);
    try {
      const res = await fetch("/api/invitations/inbox");
      if (res.ok) {
        const body = (await res.json()) as { data?: { invitations?: Invitation[] } };
        setInvitations(body.data?.invitations ?? []);
      }
    } finally {
      setInboxLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);

  const handleInvitation = async (id: string, action: "accept" | "decline") => {
    try {
      const res = await jsonApi<{ boardId?: string }>(`/api/invitations/${id}`, "POST", {
        action,
      });
      await loadInbox();
      revalidator.revalidate();
      if (action === "accept" && res.boardId) {
        navigate(`/b/${res.boardId}`);
      }
    } catch {
      await loadInbox();
    }
  };

  const create = useCallback(() => {
    if (fetcher.state !== "idle") return;
    fetcher.submit({ name }, { method: "POST", encType: "application/json" });
    setCreating(false);
    setName("");
  }, [fetcher, name]);

  // 创建后不自动跳转, 留在首页列表 (fetcher 提交后自动 revalidate 刷新列表)

  return (
    <main className="min-h-screen max-w-4xl mx-auto px-6 py-8">
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-3xl">co-note</h1>
        <div className="flex items-center gap-3">
          {/* 收件箱 */}
          <div className="relative">
            <button
              onClick={() => setInboxOpen((v) => !v)}
              className="relative rounded-full bg-white p-2.5 shadow-sm hover:shadow-md transition-shadow"
              title="收件箱"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M22 12h-6l-2 3h-4l-2-3H2" />
                <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
              </svg>
              {invitations.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4.5 h-4.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center px-1">
                  {invitations.length}
                </span>
              )}
            </button>
            {inboxOpen && (
              <div className="absolute right-0 top-12 w-80 rounded-2xl bg-white shadow-xl p-4 z-30">
                <h3 className="text-lg mb-2">收件箱</h3>
                {inboxLoading ? (
                  <p className="text-sm text-warm/50">加载中…</p>
                ) : invitations.length === 0 ? (
                  <p className="text-sm text-warm/50 py-4 text-center">
                    暂无邀请 — 把你的用户 ID 分享给朋友, 邀请你一起记生活
                  </p>
                ) : (
                  <ul className="space-y-2 max-h-80 overflow-auto">
                    {invitations.map((inv) => (
                      <li
                        key={inv.id}
                        className="rounded-xl bg-board/60 p-3 text-sm space-y-2"
                      >
                        <p>
                          <span className="font-semibold">{inv.inviterName}</span>{" "}
                          邀请你加入 <span className="font-semibold">{inv.boardName}</span>
                          <span className="ml-1 text-warm/50">
                            ({inv.role === "editor" ? "编辑者" : "观看者"})
                          </span>
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => void handleInvitation(inv.id, "accept")}
                            className="flex-1 rounded-xl bg-warm text-white py-1.5 hover:opacity-90"
                          >
                            接受
                          </button>
                          <button
                            onClick={() => void handleInvitation(inv.id, "decline")}
                            className="flex-1 rounded-xl bg-board py-1.5 hover:bg-warm/10"
                          >
                            拒绝
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* 账户菜单 */}
          <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-full bg-white py-1 pl-1 pr-4 shadow-sm hover:shadow-md transition-shadow"
          >
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt=""
                className="w-8 h-8 rounded-full"
              />
            ) : (
              <span className="w-8 h-8 rounded-full bg-note flex items-center justify-center">
                {user.name.slice(0, 1)}
              </span>
            )}
            <span className="text-lg">{user.name}</span>
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-12 w-64 rounded-2xl bg-white shadow-xl p-4 space-y-3 z-20">
              <div className="text-center">
                <p className="text-lg">{user.name}</p>
                <p className="text-sm text-warm/60">{user.email}</p>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-board/60 px-3 py-2">
                <span className="text-sm text-warm/70 break-all">{user.id}</span>
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(user.id);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                  className="ml-2 shrink-0 rounded-lg bg-white px-2 py-1 text-xs shadow-sm hover:bg-board"
                >
                  {copied ? "已复制" : "复制"}
                </button>
              </div>
              <form method="post" action="/auth/logout" className="pt-1">
                <button className="w-full rounded-xl bg-board/60 px-3 py-2 text-center text-sm hover:bg-board transition-colors">
                  退出登录
                </button>
              </form>
            </div>
          )}
        </div>
        </div>
      </header>

      {defaultBoardId && boards.find((b) => b.id === defaultBoardId) && (
        <Link
          to={`/b/${defaultBoardId}`}
          className="mb-4 flex items-center justify-between rounded-2xl bg-warm text-white px-5 py-3 shadow-md hover:opacity-95 transition-opacity"
        >
          <span className="text-lg">
            继续进入 <strong>{boards.find((b) => b.id === defaultBoardId)?.name}</strong>
          </span>
          <span>→</span>
        </Link>
      )}

      <section className="flex items-center justify-between mb-4">
        <h2 className="text-2xl">我的背景板</h2>
        <button
          onClick={() => {
            setCreating(true);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          className="rounded-xl bg-white px-4 py-2 text-lg shadow-sm hover:shadow-md transition-shadow"
        >
          + 新建
        </button>
      </section>

      {creating && (
        <div className="mb-6 rounded-2xl bg-white shadow-md p-4 flex gap-3 items-center">
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") create();
              if (e.key === "Escape") setCreating(false);
            }}
            placeholder="背景板名称 (默认: 我的生活)"
            className="flex-1 rounded-xl bg-board/60 px-4 py-2 text-lg outline-none focus:ring-2 focus:ring-blue-300"
          />
          <button
            onClick={create}
            disabled={fetcher.state !== "idle"}
            className="rounded-xl bg-warm text-white px-4 py-2 hover:opacity-90 disabled:opacity-50"
          >
            创建
          </button>
        </div>
      )}

      {boards.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-warm/20 p-12 text-center text-warm/50 text-xl">
          还没有背景板, 点击「+ 新建」创建第一块吧
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {boards.map((b) => (
            <li key={b.id}>
              <Link
                to={`/b/${b.id}`}
                className="block rounded-2xl bg-note p-5 shadow-md hover:shadow-lg transition-shadow relative"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-2xl leading-tight">{b.name}</h3>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void jsonApi(`/api/boards/${b.id}?action=default`, "POST", {}).then(() =>
                        setDefaultBoardId(b.id),
                      );
                    }}
                    className={`shrink-0 text-lg ${
                      b.id === defaultBoardId
                        ? "text-amber-500"
                        : "text-warm/30 hover:text-amber-400"
                    }`}
                    title={b.id === defaultBoardId ? "当前默认背景板" : "设为默认背景板"}
                  >
                    {b.id === defaultBoardId ? "★" : "☆"}
                  </button>
                </div>
                <div className="mt-4 flex items-center gap-4 text-sm text-warm/60">
                  <span>{b.role === "editor" ? "编辑者" : "观看者"}</span>
                  <span>{b.memberCount} 位成员</span>
                  <span>{b.noteCount} 张便笺</span>
                  <span className="ml-auto">{formatTime(b.updatedAt)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
