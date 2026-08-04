import { createCookieSessionStorage } from "react-router";
import type { User } from "~/lib/types";

export const SESSION_COOKIE = "co_note_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

const COOKIE_BASE = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: false,
};

export function getSessionStorage(env: Env) {
  return createCookieSessionStorage({
    cookie: {
      ...COOKIE_BASE,
      name: SESSION_COOKIE,
      secrets: [env.SECRET_KEY],
      maxAge: SESSION_TTL_SECONDS,
    },
  });
}

export async function getSessionUserId(
  request: Request,
  env: Env,
): Promise<string | null> {
  const storage = getSessionStorage(env);
  const session = await storage.getSession(request.headers.get("Cookie"));
  return session.get("userId") ?? null;
}

export async function getSessionUser(
  request: Request,
  env: Env,
): Promise<User | null> {
  const userId = await getSessionUserId(request, env);
  if (!userId) return null;
  const row = await env.DB.prepare(
    `SELECT id, email, name, avatar_url, created_at FROM users WHERE id = ?`,
  )
    .bind(userId)
    .first();
  if (!row) return null;
  return {
    id: row.id as string,
    email: row.email as string,
    name: row.name as string,
    avatarUrl: (row.avatar_url as string | null) ?? null,
    createdAt: row.created_at as number,
  };
}

export async function requireUser(
  request: Request,
  env: Env,
): Promise<User> {
  const user = await getSessionUser(request, env);
  if (!user) {
    throw new Response(JSON.stringify({ ok: false, error: { code: "UNAUTHORIZED", message: "请先登录" } }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return user;
}

export async function createSessionHeaders(
  userId: string,
  env: Env,
): Promise<Headers> {
  const storage = getSessionStorage(env);
  const session = await storage.getSession();
  session.set("userId", userId);
  const value = await storage.commitSession(session);
  return new Headers({ "Set-Cookie": value });
}

export async function destroySessionHeaders(env: Env): Promise<Headers> {
  const storage = getSessionStorage(env);
  const session = await storage.getSession();
  const value = await storage.destroySession(session);
  return new Headers({ "Set-Cookie": value });
}
