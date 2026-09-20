import { apiError } from "~/lib/api";
import { validatePostContent } from "~/lib/validate";
import { getSessionUser, requireUser } from "~/server/auth";
import { deletePost, getPost, updatePost } from "~/server/db";
import type { Route } from "./+types/posts.$id";

/** 帖子详情 (私密帖子仅作者可见) */
export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await getSessionUser(request, env);
  const post = await getPost(env, params.id);
  if (!post) return apiError(404, "NOT_FOUND", "帖子不存在");
  if (post.visibility === "private" && post.authorId !== user?.id) {
    return apiError(404, "NOT_FOUND", "帖子不存在");
  }
  return { ok: true, data: { post } };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  const post = await getPost(env, params.id);
  if (!post) return apiError(404, "NOT_FOUND", "帖子不存在");
  if (post.authorId !== user.id) {
    return apiError(403, "FORBIDDEN", "无权操作该帖子");
  }

  if (request.method === "PATCH") {
    const body = (await request.json().catch(() => ({}))) as {
      title?: unknown;
      content?: unknown;
      visibility?: unknown;
    };
    const changes: { title?: string; content?: string; visibility?: "public" | "private" } = {};
    if (typeof body.title === "string") {
      const title = body.title.trim();
      if (title.length < 1 || title.length > 80) {
        return apiError(400, "INVALID_TITLE", "标题需为 1~80 个字符");
      }
      changes.title = title;
    }
    if (typeof body.content === "string") {
      const content = body.content.trim();
      const contentError = validatePostContent(content);
      if (contentError) return apiError(400, "INVALID_CONTENT", contentError);
      changes.content = content;
    }
    if (body.visibility === "public" || body.visibility === "private") {
      changes.visibility = body.visibility;
    }
    const updated = await updatePost(env, post.id, changes);
    return { ok: true, data: { post: updated } };
  }

  if (request.method === "DELETE") {
    const removed = await deletePost(env, post.id);
    if (removed && removed.mediaKeys.length > 0) {
      await env.IMAGES.delete(removed.mediaKeys);
    }
    return { ok: true, data: { id: post.id } };
  }

  return apiError(405, "METHOD_NOT_ALLOWED", "不支持的请求方法");
}
