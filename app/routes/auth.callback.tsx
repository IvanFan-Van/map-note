import { redirect } from "react-router";
import { createSessionHeaders } from "~/server/auth";
import { findOrCreateUserByGoogle } from "~/server/db";
import {
  clearOAuthSessionHeaders,
  exchangeCode,
  readOAuthSession,
} from "~/server/oauth";
import type { Route } from "./+types/auth.callback";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const oauth = await readOAuthSession(request, env);

  if (oauthError || !code || !oauth || oauth.state !== state) {
    return redirect("/?login_error=1");
  }

  const info = await exchangeCode(env, request, code, oauth.codeVerifier);
  const user = await findOrCreateUserByGoogle(env, info);
  const sessionHeaders = await createSessionHeaders(user.id, env);
  const clearHeaders = await clearOAuthSessionHeaders(env);

  const headers = new Headers(sessionHeaders);
  const clearValue = clearHeaders.get("Set-Cookie");
  if (clearValue) headers.append("Set-Cookie", clearValue);
  return redirect(oauth.returnTo, { headers });
}
