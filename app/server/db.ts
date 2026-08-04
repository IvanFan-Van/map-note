import type { BoardSummary, User } from "~/lib/types";
import type { GoogleUserInfo } from "~/server/oauth";

export function now(): number {
  return Date.now();
}

export function newId(): string {
  return crypto.randomUUID();
}

export async function findOrCreateUserByGoogle(
  env: Env,
  info: GoogleUserInfo,
): Promise<User> {
  const existing = await env.DB.prepare(
    `SELECT id, email, name, avatar_url, created_at FROM users WHERE google_sub = ?`,
  )
    .bind(info.sub)
    .first<{
      id: string;
      email: string;
      name: string;
      avatar_url: string | null;
      created_at: number;
    }>();
  if (existing) {
    return {
      id: existing.id,
      email: existing.email,
      name: existing.name,
      avatarUrl: existing.avatar_url,
      createdAt: existing.created_at,
    };
  }
  const id = newId();
  await env.DB.prepare(
    `INSERT INTO users (id, google_sub, email, name, avatar_url, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, info.sub, info.email, info.name, info.picture, now())
    .run();
  return {
    id,
    email: info.email,
    name: info.name,
    avatarUrl: info.picture,
    createdAt: now(),
  };
}

export async function listBoardsForUser(
  env: Env,
  userId: string,
): Promise<BoardSummary[]> {
  const rows = await env.DB.prepare(
    `SELECT
       b.id, b.owner_id, b.name, b.created_at, m.role,
       (SELECT COUNT(*) FROM board_members bm WHERE bm.board_id = b.id) AS member_count,
       (SELECT COUNT(*) FROM notes n WHERE n.board_id = b.id) AS note_count,
       COALESCE((SELECT MAX(n.updated_at) FROM notes n WHERE n.board_id = b.id), b.created_at) AS updated_at
     FROM boards b
     JOIN board_members m ON m.board_id = b.id
     WHERE m.user_id = ?
     ORDER BY updated_at DESC`,
  )
    .bind(userId)
    .all<{
      id: string;
      owner_id: string;
      name: string;
      created_at: number;
      role: "editor" | "viewer";
      member_count: number;
      note_count: number;
      updated_at: number;
    }>();
  return rows.results.map((r) => ({
    id: r.id,
    ownerId: r.owner_id,
    name: r.name,
    role: r.role,
    memberCount: r.member_count,
    noteCount: r.note_count,
    updatedAt: r.updated_at,
    createdAt: r.created_at,
  }));
}

export async function createBoard(
  env: Env,
  ownerId: string,
  name: string,
): Promise<BoardSummary> {
  const id = newId();
  const ts = now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO boards (id, owner_id, name, created_at) VALUES (?, ?, ?, ?)`,
    ).bind(id, ownerId, name, ts),
    env.DB.prepare(
      `INSERT INTO board_members (board_id, user_id, role, created_at) VALUES (?, ?, 'editor', ?)`,
    ).bind(id, ownerId, ts),
  ]);
  return {
    id,
    ownerId,
    name,
    role: "editor",
    memberCount: 1,
    noteCount: 0,
    updatedAt: ts,
    createdAt: ts,
  };
}

export async function getUserSettings(
  env: Env,
  userId: string,
): Promise<{ defaultBoardId: string | null }> {
  const row = await env.DB.prepare(
    `SELECT default_board_id FROM user_settings WHERE user_id = ?`,
  )
    .bind(userId)
    .first<{ default_board_id: string | null }>();
  return { defaultBoardId: row?.default_board_id ?? null };
}

export async function getBoardRole(
  env: Env,
  boardId: string,
  userId: string,
): Promise<"editor" | "viewer" | null> {
  const row = await env.DB.prepare(
    `SELECT role FROM board_members WHERE board_id = ? AND user_id = ?`,
  )
    .bind(boardId, userId)
    .first<{ role: "editor" | "viewer" }>();
  return row?.role ?? null;
}
