import { apiError } from "~/lib/api";
import { requireUser } from "~/server/auth";
import { getOwnedPlace } from "~/server/access";
import { createPlaceNote } from "~/server/db";
import { validateNoteContent } from "~/lib/validate";
import type { Route } from "./+types/place-notes";

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  const place = await getOwnedPlace(env, user.id, params.id);
  if (place instanceof Response) return place;
  if (request.method !== "POST") {
    return apiError(405, "METHOD_NOT_ALLOWED", "不支持的请求方法");
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const contentError = validateNoteContent(content);
  if (contentError) {
    return apiError(400, "INVALID_CONTENT", contentError);
  }
  const note = await createPlaceNote(env, place.id, content);
  return { ok: true, data: { note } };
}
