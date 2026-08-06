import type {
  AlignH,
  AlignV,
  Block,
  BoardDetail,
  BoardSummary,
  Invitation,
  Note,
  Role,
  User,
} from "~/lib/types";
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
       b.id, b.owner_id, b.name, b.type, b.created_at, m.role,
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
      type: "sticky" | "canvas";
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
    type: r.type,
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
  type: "sticky" | "canvas" = "sticky",
): Promise<BoardSummary> {
  const id = newId();
  const ts = now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO boards (id, owner_id, name, type, created_at) VALUES (?, ?, ?, ?, ?)`,
    ).bind(id, ownerId, name, type, ts),
    env.DB.prepare(
      `INSERT INTO board_members (board_id, user_id, role, created_at) VALUES (?, ?, 'editor', ?)`,
    ).bind(id, ownerId, ts),
  ]);
  return {
    id,
    ownerId,
    name,
    type,
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

export async function deleteBoard(env: Env, boardId: string): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM notes WHERE board_id = ?`).bind(boardId),
    env.DB.prepare(`DELETE FROM invitations WHERE board_id = ?`).bind(boardId),
    env.DB.prepare(`DELETE FROM board_members WHERE board_id = ?`).bind(boardId),
    env.DB.prepare(
      `UPDATE user_settings SET default_board_id = NULL, updated_at = ? WHERE default_board_id = ?`,
    ).bind(now(), boardId),
    env.DB.prepare(`DELETE FROM boards WHERE id = ?`).bind(boardId),
  ]);
}

// ---------- 便笺 ----------

const NOTE_SELECT = `id, board_id, author_id, content, pos_x, pos_y, z_index, width, meta, mood, weather, fatigue, diet, created_at, updated_at`;

function noteFromRow(r: {
  id: string;
  board_id: string;
  author_id: string;
  content: string;
  pos_x: number;
  pos_y: number;
  z_index: number;
  width: number;
  meta: string;
  mood: string | null;
  weather: string | null;
  fatigue: number | null;
  diet: string | null;
  created_at: number;
  updated_at: number;
}): Note {
  let meta: Record<string, string> = {};
  try {
    const parsed = JSON.parse(r.meta);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      meta = parsed as Record<string, string>;
    }
  } catch {
    // 损坏的 meta JSON 回退为空对象
  }
  return {
    id: r.id,
    boardId: r.board_id,
    authorId: r.author_id,
    content: r.content,
    posX: r.pos_x,
    posY: r.pos_y,
    zIndex: r.z_index,
    width: r.width,
    meta,
    mood: r.mood,
    weather: r.weather,
    fatigue: r.fatigue,
    diet: r.diet,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listNotes(env: Env, boardId: string): Promise<Note[]> {
  const rows = await env.DB.prepare(
    `SELECT ${NOTE_SELECT} FROM notes WHERE board_id = ? ORDER BY z_index, created_at`,
  )
    .bind(boardId)
    .all<Parameters<typeof noteFromRow>[0]>();
  return rows.results.map(noteFromRow);
}

export async function getNote(
  env: Env,
  noteId: string,
): Promise<Note | null> {
  const row = await env.DB.prepare(`SELECT ${NOTE_SELECT} FROM notes WHERE id = ?`)
    .bind(noteId)
    .first<Parameters<typeof noteFromRow>[0]>();
  return row ? noteFromRow(row) : null;
}

export async function createNote(
  env: Env,
  boardId: string,
  authorId: string,
  data: { x: number; y: number; content?: string; width?: number },
): Promise<Note> {
  const id = newId();
  const ts = now();
  const zRow = await env.DB.prepare(
    `SELECT COALESCE(MAX(z_index), 0) + 1 AS z FROM notes WHERE board_id = ?`,
  )
    .bind(boardId)
    .first<{ z: number }>();
  await env.DB.prepare(
    `INSERT INTO notes (id, board_id, author_id, content, pos_x, pos_y, z_index, width, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      boardId,
      authorId,
      data.content ?? "",
      data.x,
      data.y,
      zRow?.z ?? 0,
      data.width ?? 260,
      ts,
      ts,
    )
    .run();
  return (await getNote(env, id))!;
}

export async function updateNote(
  env: Env,
  noteId: string,
  changes: Partial<
    Pick<Note, "content" | "meta" | "mood" | "weather" | "fatigue" | "diet">
  >,
): Promise<Note | null> {
  const ts = now();
  const sets: string[] = [];
  const binds: (string | number | null)[] = [];
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) continue;
    sets.push(`${key} = ?`);
    binds.push(
      key === "meta" ? JSON.stringify(value) : (value as string | number | null),
    );
  }
  if (sets.length === 0) return getNote(env, noteId);
  sets.push("updated_at = ?");
  binds.push(ts, noteId);
  await env.DB.prepare(`UPDATE notes SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...binds)
    .run();
  return getNote(env, noteId);
}

export async function moveNote(
  env: Env,
  noteId: string,
  x: number,
  y: number,
): Promise<Note | null> {
  await env.DB.prepare(
    `UPDATE notes SET pos_x = ?, pos_y = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(x, y, now(), noteId)
    .run();
  return getNote(env, noteId);
}

export async function deleteNote(env: Env, noteId: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM notes WHERE id = ?`).bind(noteId).run();
}

// ---------- 文本块 (无限画布板) ----------

const BLOCK_SELECT = `id, board_id, author_id, text, pos_x, pos_y, z_index, width, align_h, align_v, created_at, updated_at`;

function blockFromRow(r: {
  id: string;
  board_id: string;
  author_id: string;
  text: string;
  pos_x: number;
  pos_y: number;
  z_index: number;
  width: number;
  align_h: AlignH;
  align_v: AlignV;
  created_at: number;
  updated_at: number;
}): Block {
  return {
    id: r.id,
    boardId: r.board_id,
    authorId: r.author_id,
    text: r.text,
    posX: r.pos_x,
    posY: r.pos_y,
    zIndex: r.z_index,
    width: r.width,
    alignH: r.align_h,
    alignV: r.align_v,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listBlocks(env: Env, boardId: string): Promise<Block[]> {
  const rows = await env.DB.prepare(
    `SELECT ${BLOCK_SELECT} FROM blocks WHERE board_id = ? ORDER BY z_index, created_at`,
  )
    .bind(boardId)
    .all<Parameters<typeof blockFromRow>[0]>();
  return rows.results.map(blockFromRow);
}

export async function getBlock(
  env: Env,
  blockId: string,
): Promise<Block | null> {
  const row = await env.DB.prepare(`SELECT ${BLOCK_SELECT} FROM blocks WHERE id = ?`)
    .bind(blockId)
    .first<Parameters<typeof blockFromRow>[0]>();
  return row ? blockFromRow(row) : null;
}

export async function createBlock(
  env: Env,
  boardId: string,
  authorId: string,
  data: { x: number; y: number; text?: string },
): Promise<Block> {
  const id = newId();
  const ts = now();
  const zRow = await env.DB.prepare(
    `SELECT COALESCE(MAX(z_index), 0) + 1 AS z FROM blocks WHERE board_id = ?`,
  )
    .bind(boardId)
    .first<{ z: number }>();
  await env.DB.prepare(
    `INSERT INTO blocks (id, board_id, author_id, text, pos_x, pos_y, z_index, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      boardId,
      authorId,
      data.text ?? "",
      data.x,
      data.y,
      zRow?.z ?? 0,
      ts,
      ts,
    )
    .run();
  return (await getBlock(env, id))!;
}

export async function updateBlock(
  env: Env,
  blockId: string,
  changes: Partial<
    Pick<Block, "text" | "width" | "alignH" | "alignV">
  >,
): Promise<Block | null> {
  const ts = now();
  // TS 键 → DB 列名 (align_h / align_v)
  const COLUMN_MAP: Record<string, string> = {
    alignH: "align_h",
    alignV: "align_v",
  };
  const sets: string[] = [];
  const binds: (string | number | null)[] = [];
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) continue;
    sets.push(`${COLUMN_MAP[key] ?? key} = ?`);
    binds.push(value as string | number | null);
  }
  if (sets.length === 0) return getBlock(env, blockId);
  sets.push("updated_at = ?");
  binds.push(ts, blockId);
  await env.DB.prepare(`UPDATE blocks SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...binds)
    .run();
  return getBlock(env, blockId);
}

export async function moveBlock(
  env: Env,
  blockId: string,
  x: number,
  y: number,
): Promise<Block | null> {
  await env.DB.prepare(
    `UPDATE blocks SET pos_x = ?, pos_y = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(x, y, now(), blockId)
    .run();
  return getBlock(env, blockId);
}

export async function deleteBlock(env: Env, blockId: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM blocks WHERE id = ?`).bind(blockId).run();
}

// ---------- 背景板详情 ----------

export async function getBoardDetail(
  env: Env,
  boardId: string,
  userId: string,
): Promise<BoardDetail | null> {
  const row = await env.DB.prepare(
    `SELECT b.id, b.name, b.owner_id, b.type, m.role
     FROM boards b JOIN board_members m ON m.board_id = b.id
     WHERE b.id = ? AND m.user_id = ?`,
  )
    .bind(boardId, userId)
    .first<{
      id: string;
      name: string;
      owner_id: string;
      type: "sticky" | "canvas";
      role: Role;
    }>();
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    type: row.type,
    role: row.role,
  };
}

// ---------- 邀请与收件箱 ----------

export async function createInvitation(
  env: Env,
  boardId: string,
  inviterId: string,
  inviteeId: string,
  role: Role,
): Promise<Invitation | null> {
  const dup = await env.DB.prepare(
    `SELECT id FROM invitations WHERE board_id = ? AND invitee_id = ? AND status = 'pending'`,
  )
    .bind(boardId, inviteeId)
    .first();
  if (dup) return null;
  const id = newId();
  const ts = now();
  await env.DB.prepare(
    `INSERT INTO invitations (id, board_id, inviter_id, invitee_id, role, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
  )
    .bind(id, boardId, inviterId, inviteeId, role, ts, ts)
    .run();
  const row = await env.DB.prepare(
    `SELECT i.id, i.board_id, i.inviter_id, i.invitee_id, i.role, i.status, i.created_at,
            b.name AS board_name, u.name AS inviter_name
     FROM invitations i
     JOIN boards b ON b.id = i.board_id
     JOIN users u ON u.id = i.inviter_id
     WHERE i.id = ?`,
  )
    .bind(id)
    .first<InvitationRow>();
  return row ? invitationFromRow(row) : null;
}

interface InvitationRow {
  id: string;
  board_id: string;
  inviter_id: string;
  invitee_id: string;
  role: Role;
  status: "pending" | "accepted" | "declined";
  created_at: number;
  board_name: string;
  inviter_name: string;
}

function invitationFromRow(r: InvitationRow): Invitation {
  return {
    id: r.id,
    boardId: r.board_id,
    boardName: r.board_name,
    inviterId: r.inviter_id,
    inviterName: r.inviter_name,
    role: r.role,
    status: r.status,
    createdAt: r.created_at,
  };
}

export async function listInbox(
  env: Env,
  userId: string,
): Promise<Invitation[]> {
  const rows = await env.DB.prepare(
    `SELECT i.id, i.board_id, i.inviter_id, i.invitee_id, i.role, i.status, i.created_at,
            b.name AS board_name, u.name AS inviter_name
     FROM invitations i
     JOIN boards b ON b.id = i.board_id
     JOIN users u ON u.id = i.inviter_id
     WHERE i.invitee_id = ? AND i.status = 'pending'
     ORDER BY i.created_at DESC`,
  )
    .bind(userId)
    .all<InvitationRow>();
  return rows.results.map(invitationFromRow);
}

export async function acceptInvitation(
  env: Env,
  invitationId: string,
  userId: string,
): Promise<{ boardId: string; role: Role; boardName: string } | null> {
  const row = await env.DB.prepare(
    `SELECT i.id, i.board_id, i.invitee_id, i.role, b.name AS board_name
     FROM invitations i JOIN boards b ON b.id = i.board_id
     WHERE i.id = ? AND i.status = 'pending'`,
  )
    .bind(invitationId)
    .first<{ id: string; board_id: string; invitee_id: string; role: Role; board_name: string }>();
  if (!row || row.invitee_id !== userId) return null;
  const ts = now();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE invitations SET status = 'accepted', updated_at = ? WHERE id = ?`,
    ).bind(ts, invitationId),
    env.DB.prepare(
      `INSERT OR IGNORE INTO board_members (board_id, user_id, role, created_at) VALUES (?, ?, ?, ?)`,
    ).bind(row.board_id, userId, row.role, ts),
  ]);
  return { boardId: row.board_id, role: row.role, boardName: row.board_name };
}

export async function declineInvitation(
  env: Env,
  invitationId: string,
  userId: string,
): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT id FROM invitations WHERE id = ? AND status = 'pending' AND invitee_id = ?`,
  )
    .bind(invitationId, userId)
    .first<{ id: string }>();
  if (!row) return false;
  await env.DB.prepare(
    `UPDATE invitations SET status = 'declined', updated_at = ? WHERE id = ?`,
  )
    .bind(now(), invitationId)
    .run();
  return true;
}

// ---------- 默认背景板 ----------

export async function setDefaultBoard(
  env: Env,
  userId: string,
  boardId: string,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO user_settings (user_id, default_board_id, updated_at) VALUES (?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET default_board_id = excluded.default_board_id, updated_at = excluded.updated_at`,
  )
    .bind(userId, boardId, now())
    .run();
}
