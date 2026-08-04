import { requireUser } from "~/server/auth";
import { getBoardRole } from "~/server/db";
import type { Route } from "./+types/images.$";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  const key = params["*"];
  if (!key) {
    return new Response("Not Found", { status: 404 });
  }
  const match = key.match(/^boards\/([^/]+)\//);
  if (!match) {
    return new Response("Not Found", { status: 404 });
  }
  const boardId = match[1];
  const role = await getBoardRole(env, boardId, user.id);
  if (!role) {
    return new Response("Forbidden", { status: 403 });
  }
  const object = await env.IMAGES.get(key);
  if (!object) {
    return new Response("Not Found", { status: 404 });
  }
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "private, max-age=86400");
  return new Response(object.body, { headers });
}
