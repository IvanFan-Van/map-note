import { useRef, useState } from "react";
import { isRouteErrorResponse, Link, useNavigate } from "react-router";
import { errorMessage, jsonApi, postForm } from "~/lib/api";
import { formatTime } from "~/lib/format";
import type { Post } from "~/lib/types";
import { getSessionUser } from "~/server/auth";
import { getPost } from "~/server/db";
import type { Route } from "./+types/posts.$id";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await getSessionUser(request, env);
  const post = await getPost(env, params.id);
  if (!post || (post.visibility === "private" && post.authorId !== user?.id)) {
    throw new Response("Not Found", { status: 404 });
  }
  return { user, post };
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <main className="post-page">
      <div className="post-missing">
        <h1>{notFound ? "帖子不存在" : "出错了"}</h1>
        <p>{notFound ? "帖子可能已被删除, 或你没有访问权限。" : "请稍后重试。"}</p>
        <Link to="/" className="pp-btn primary">返回地图</Link>
      </div>
    </main>
  );
}

/** 帖子详情页 (公开可访问, 私密帖子仅作者) */
export default function PostDetail({ loaderData }: Route.ComponentProps) {
  const { user, post: initialPost } = loaderData;
  const navigate = useNavigate();
  const [post, setPost] = useState<Post>(initialPost);
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const isAuthor = user?.id === post.authorId;

  const refresh = async () => {
    const data = await jsonApi<{ post: Post }>("/api/posts/" + post.id, "GET");
    setPost(data.post);
  };

  const uploadFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(list)) {
        const fd = new FormData();
        fd.append("file", file);
        await postForm("/api/posts/" + post.id + "/media", fd);
      }
      await refresh();
    } catch (e) {
      setError(errorMessage(e, "图片上传失败"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeMedia = async (mediaId: string) => {
    if (!window.confirm("确定删除这张照片吗?")) return;
    try {
      await jsonApi("/api/posts/" + post.id + "/media/" + mediaId, "DELETE");
      await refresh();
    } catch (e) {
      setError(errorMessage(e, "删除失败"));
    }
  };

  const removePost = async () => {
    if (!window.confirm("确定删除这篇帖子吗? 帖子与照片将一并移除。")) return;
    try {
      await jsonApi("/api/posts/" + post.id, "DELETE");
      navigate("/");
    } catch (e) {
      setError(errorMessage(e, "删除失败"));
    }
  };

  return (
    <main className="post-page">
      <header className="post-page-header">
        <Link to="/" className="header-btn">← 返回地图</Link>
        <span className="post-page-brand">🧭 地图探索</span>
        {user ? (
          <span className="user-chip">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="user-avatar" />
            ) : (
              <span className="user-avatar">{user.name.slice(0, 1)}</span>
            )}
            <span className="user-name">{user.name}</span>
          </span>
        ) : (
          <Link to="/auth/login" className="header-btn">登录</Link>
        )}
      </header>

      <article className="post-article">
        {editing ? (
          <PostEditForm
            post={post}
            onSaved={(updated) => {
              setPost(updated);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
            <h1 className="post-title">{post.title}</h1>
            <div className="post-meta">
              {post.author?.avatarUrl ? (
                <img src={post.author.avatarUrl} alt="" className="user-avatar" />
              ) : (
                <span className="user-avatar">{(post.author?.name ?? "?").slice(0, 1)}</span>
              )}
              <span className="post-author">{post.author?.name ?? "匿名"}</span>
              <span className="post-time">{formatTime(post.createdAt)}</span>
              {post.visibility === "private" && <span className="badge-private">私密</span>}
            </div>
            <p className="post-location">
              📍 {post.placeName || "未知地点"}
              {post.address ? " · " + post.address : ""}
            </p>
            {post.media.length > 0 && (
              <div className="post-media-grid">
                {post.media.map((m) => (
                  <span key={m.id} className="post-media-cell">
                    <img src={m.url} alt="" className="post-media-img" loading="lazy" />
                    {isAuthor && (
                      <button className="photo-del" title="删除照片" onClick={() => void removeMedia(m.id)}>×</button>
                    )}
                  </span>
                ))}
              </div>
            )}
            {post.content && <p className="post-content">{post.content}</p>}
          </>
        )}

        {error && <p className="pp-error">{error}</p>}

        {isAuthor && !editing && (
          <div className="post-actions">
            <button className="pp-btn" onClick={() => setEditing(true)}>✏️ 编辑</button>
            <button className="pp-btn" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? "上传中…" : "＋ 添加照片"}
            </button>
            <span className="pp-spacer" />
            <button className="pp-btn danger" onClick={() => void removePost()}>删除帖子</button>
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden
          onChange={(e) => void uploadFiles(e.target.files)} />
      </article>
    </main>
  );
}

function PostEditForm({
  post,
  onSaved,
  onCancel,
}: {
  post: Post;
  onSaved: (post: Post) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(post.title);
  const [content, setContent] = useState(post.content);
  const [visibility, setVisibility] = useState<"public" | "private">(post.visibility);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!title.trim()) {
      setError("标题不能为空");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const data = await jsonApi<{ post: Post }>("/api/posts/" + post.id, "PATCH", {
        title: title.trim(),
        content: content.trim(),
        visibility,
      });
      onSaved(data.post);
    } catch (e) {
      setError(errorMessage(e, "保存失败"));
      setSaving(false);
    }
  };

  return (
    <div>
      <label className="pp-field">
        <span>标题 *</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} autoFocus />
      </label>
      <label className="pp-field">
        <span>正文</span>
        <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={6} maxLength={10000} />
      </label>
      <label className="pp-field">
        <span>可见性</span>
        <select value={visibility} onChange={(e) => setVisibility(e.target.value as "public" | "private")}>
          <option value="public">公开 (出现在探索地图)</option>
          <option value="private">私密 (仅自己可见)</option>
        </select>
      </label>
      {error && <p className="pp-error">{error}</p>}
      <div className="post-actions">
        <button className="pp-btn" onClick={onCancel} disabled={saving}>取消</button>
        <button className="pp-btn primary" onClick={() => void save()} disabled={saving}>
          {saving ? "保存中…" : "保存"}
        </button>
      </div>
    </div>
  );
}
