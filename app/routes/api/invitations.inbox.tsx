import { requireUser } from "~/server/auth";
import { listInbox } from "~/server/db";
import type { Route } from "./+types/invitations.inbox";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  const invitations = await listInbox(env, user.id);
  return { ok: true, data: { invitations } };
}
