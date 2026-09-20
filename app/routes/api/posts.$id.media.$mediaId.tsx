import { apiError } from "~/lib/api";
import { requireUser } from "~/server/auth";
import { deletePostMedia, getPost } from "~/server/db";
import type { Route } from "./+types/posts.$id.media.$mediaId";

/** 删除帖子中的一张照片 (仅作者) */
export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  if (request.method !== "DELETE") {
    return apiError(405, "METHOD_NOT_ALLOWED", "不支持的请求方法");
  }
  const post = await getPost(env, params.id);
  if (!post) return apiError(404, "NOT_FOUND", "帖子不存在");
  if (post.authorId !== user.id) {
    return apiError(403, "FORBIDDEN", "无权操作该帖子");
  }
  const removed = await deletePostMedia(env, params.mediaId);
  if (!removed || removed.postId !== post.id) {
    return apiError(404, "NOT_FOUND", "照片不存在");
  }
  await env.IMAGES.delete(removed.key);
  return { ok: true, data: { id: params.mediaId } };
}
