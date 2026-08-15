import { requireUser } from "~/server/auth";
import { getPlace } from "~/server/db";
import type { Route } from "./+types/images.$";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  const key = params["*"];
  if (!key) return new Response("Not Found", { status: 404 });
  const match = key.match(/^places\/([^/]+)\//);
  if (!match) return new Response("Not Found", { status: 404 });
  const place = await getPlace(env, match[1]);
  if (!place) return new Response("Not Found", { status: 404 });
  if (place.ownerId !== user.id) return new Response("Forbidden", { status: 403 });
  const object = await env.IMAGES.get(key);
  if (!object) return new Response("Not Found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "private, max-age=86400");
  return new Response(object.body, { headers });
}
