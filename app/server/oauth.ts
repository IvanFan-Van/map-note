import { createCookieSessionStorage } from "react-router";
import { apiError } from "~/lib/api";
import { COOKIE_BASE } from "~/server/cookies";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const OAUTH_COOKIE = "map_note_oauth";
const OAUTH_TTL_SECONDS = 10 * 60;

export interface GoogleUserInfo {
  sub: string;
  email: string;
  name: string;
  picture: string | null;
}

export interface OAuthStart {
  url: string;
  setCookie: string;
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomBase64Url(len: number): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes.buffer);
}

function oauthStorage(env: Env) {
  return createCookieSessionStorage({
    cookie: {
      name: OAUTH_COOKIE,
      secrets: [env.SECRET_KEY],
      ...COOKIE_BASE,
      maxAge: OAUTH_TTL_SECONDS,
    },
  });
}

export function callbackUrl(request: Request): string {
  const url = new URL(request.url);
  return `${url.origin}/auth/callback`;
}

export async function startOAuth(
  env: Env,
  request: Request,
  returnTo = "/",
): Promise<OAuthStart> {
  const codeVerifier = randomBase64Url(48);
  const challengeBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
  const codeChallenge = base64UrlEncode(challengeBuf);
  const state = randomBase64Url(32);

  const storage = oauthStorage(env);
  const session = await storage.getSession();
  session.set("state", state);
  session.set("codeVerifier", codeVerifier);
  session.set("returnTo", returnTo);
  const cookieValue = await storage.commitSession(session);

  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", callbackUrl(request));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);

  return { url: url.toString(), setCookie: cookieValue };
}

export async function readOAuthSession(
  request: Request,
  env: Env,
): Promise<{ state: string; codeVerifier: string; returnTo: string } | null> {
  const storage = oauthStorage(env);
  const session = await storage.getSession(request.headers.get("Cookie"));
  const state = session.get("state") as string | undefined;
  const codeVerifier = session.get("codeVerifier") as string | undefined;
  const returnTo = (session.get("returnTo") as string | undefined) ?? "/";
  if (!state || !codeVerifier) return null;
  return { state, codeVerifier, returnTo };
}

export async function clearOAuthSessionHeaders(env: Env): Promise<Headers> {
  const storage = oauthStorage(env);
  const session = await storage.getSession();
  const value = await storage.destroySession(session);
  return new Headers({ "Set-Cookie": value });
}

export async function exchangeCode(
  env: Env,
  request: Request,
  code: string,
  codeVerifier: string,
): Promise<GoogleUserInfo> {
  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: callbackUrl(request),
      code_verifier: codeVerifier,
    }),
  });
  if (!tokenRes.ok) {
    throw apiError(502, "OAUTH_TOKEN_FAILED", "换取令牌失败");
  }
  const token = (await tokenRes.json()) as { access_token: string };

  const infoRes = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!infoRes.ok) {
    throw apiError(502, "OAUTH_USERINFO_FAILED", "获取用户信息失败");
  }
  const info = (await infoRes.json()) as GoogleUserInfo;
  return info;
}
