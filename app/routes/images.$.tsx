import { getSessionUser } from "~/server/auth";
import { getPostAccess } from "~/server/db";
import type { Route } from "./+types/images.$";

/** R2 图片访问: 公开帖子的图片可匿名读取, 私密帖子仅作者可读 */
export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const key = params["*"];
  if (!key) return new Response("Not Found", { status: 404 });
  const match = key.match(/^posts\/([^/]+)\//);
  if (!match) return new Response("Not Found", { status: 404 });
  const access = await getPostAccess(env, match[1]);
  if (!access) return new Response("Not Found", { status: 404 });
  if (access.visibility === "private") {
    const user = await getSessionUser(request, env);
    if (!user || user.id !== access.authorId) {
      return new Response("Forbidden", { status: 403 });
    }
  }
  const object = await env.IMAGES.get(key);
  if (!object) return new Response("Not Found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set(
    "Cache-Control",
    access.visibility === "public" ? "public, max-age=86400" : "private, max-age=86400",
  );
  return new Response(object.body, { headers });
}
