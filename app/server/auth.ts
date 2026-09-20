import { createCookieSessionStorage } from "react-router";
import { apiError } from "~/lib/api";
import type { User } from "~/lib/types";
import { COOKIE_BASE } from "~/server/cookies";
import { getUserById } from "~/server/db";

export const SESSION_COOKIE = "map_note_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

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
  return getUserById(env, userId);
}

export async function requireUser(
  request: Request,
  env: Env,
): Promise<User> {
  const user = await getSessionUser(request, env);
  if (!user) throw apiError(401, "UNAUTHORIZED", "请先登录");
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
