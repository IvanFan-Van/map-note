import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { errorMessage, jsonApi } from "~/lib/api";
import { formatTime } from "~/lib/format";
import type { LocationPoint, PostSummary, User } from "~/lib/types";

/** 底部抽屉: 查看某地点下的帖子列表 */
export function PostDrawer({
  location,
  user,
  onClose,
  onCreateHere,
}: {
  location: LocationPoint;
  user: User | null;
  onClose: () => void;
  onCreateHere: () => void;
}) {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<PostSummary[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    (cursor: string | null) =>
      jsonApi<{ posts: PostSummary[]; nextCursor: string | null }>(
        "/api/locations/" + location.id + "/posts" + (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""),
        "GET",
      ),
    [location.id],
  );

  useEffect(() => {
    let cancelled = false;
    setPosts(null);
    setNextCursor(null);
    setError(null);
    void load(null)
      .then((data) => {
        if (cancelled) return;
        setPosts(data.posts ?? []);
        setNextCursor(data.nextCursor);
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e, "加载失败"));
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await load(nextCursor);
      setPosts((prev) => [...(prev ?? []), ...(data.posts ?? [])]);
      setNextCursor(data.nextCursor);
    } catch (e) {
      setError(errorMessage(e, "加载失败"));
    } finally {
      setLoadingMore(false);
    }
  };

  const startCreate = () => {
    if (!user) {
      navigate("/auth/login");
      return;
    }
    onCreateHere();
  };

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="post-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-grip" />
        <header className="drawer-header">
          <div>
            <h2>📍 {location.name || "未知地点"}</h2>
            <p className="drawer-sub">
              {location.address || location.lat.toFixed(4) + ", " + location.lng.toFixed(4)}
              {" · 共 " + location.postCount + " 篇帖子"}
            </p>
          </div>
          <button className="pp-close" onClick={onClose} title="关闭">×</button>
        </header>

        <div className="drawer-list">
          {error && <p className="pp-error">{error}</p>}
          {posts === null ? (
            <p className="drawer-empty">加载中…</p>
          ) : posts.length === 0 ? (
            <p className="drawer-empty">这里还没有帖子, 来发第一篇吧</p>
          ) : (
            <>
              {posts.map((p) => (
                <button key={p.id} className="post-card" onClick={() => navigate("/posts/" + p.id)}>
                  {p.coverUrl ? (
                    <img className="post-card-cover" src={p.coverUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="post-card-cover post-card-empty">📝</span>
                  )}
                  <span className="post-card-body">
                    <span className="post-card-title">{p.title}</span>
                    <span className="post-card-meta">
                      {(p.author?.name ?? "匿名") + " · " + formatTime(p.createdAt)}
                    </span>
                  </span>
                </button>
              ))}
              {nextCursor && (
                <button className="pp-btn full" onClick={() => void loadMore()} disabled={loadingMore}>
                  {loadingMore ? "加载中…" : "加载更多"}
                </button>
              )}
            </>
          )}
        </div>

        <footer className="drawer-footer">
          <button className="pp-btn primary full" onClick={startCreate}>✍️ 在此发帖</button>
        </footer>
      </aside>
    </div>
  );
}
