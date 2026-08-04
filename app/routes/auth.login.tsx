import { startOAuth } from "~/server/oauth";
import type { Route } from "./+types/auth.login";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const url = new URL(request.url);
  const returnTo = url.searchParams.get("returnTo") ?? "/";
  const { url: authUrl, setCookie } = await startOAuth(env, request, returnTo);
  return new Response(null, {
    status: 302,
    headers: { Location: authUrl, "Set-Cookie": setCookie },
  });
}
