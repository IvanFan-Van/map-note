import type { MetaItem, PhotoItem, Place, PlaceNote, User } from "~/lib/types";
import type { GoogleUserInfo } from "~/server/oauth";

export function now(): number {
  return Date.now();
}

export function newId(): string {
  return crypto.randomUUID();
}

// ---------- 用户 ----------

const USER_COLUMNS = `id, email, name, avatar_url, created_at`;

interface UserRow {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  created_at: number;
}

function userFromRow(r: UserRow): User {
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    avatarUrl: r.avatar_url,
    createdAt: r.created_at,
  };
}

export async function getUserById(env: Env, userId: string): Promise<User | null> {
  const row = await env.DB.prepare(
    `SELECT ${USER_COLUMNS} FROM users WHERE id = ?`,
  )
    .bind(userId)
    .first<UserRow>();
  return row ? userFromRow(row) : null;
}

export async function findOrCreateUserByGoogle(
  env: Env,
  info: GoogleUserInfo,
): Promise<User> {
  const existing = await env.DB.prepare(
    `SELECT ${USER_COLUMNS} FROM users WHERE google_sub = ?`,
  )
    .bind(info.sub)
    .first<UserRow>();
  if (existing) return userFromRow(existing);
  const id = newId();
  const ts = now();
  await env.DB.prepare(
    `INSERT INTO users (id, google_sub, email, name, avatar_url, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, info.sub, info.email, info.name, info.picture, ts)
    .run();
  return {
    id,
    email: info.email,
    name: info.name,
    avatarUrl: info.picture,
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

// ---------- 地点 (places) ----------

const PLACE_COLUMNS = `id, owner_id, name, address, description, lat, lng, photos, metas, sort_order, created_at, updated_at`;

interface PlaceRow {
  id: string;
  owner_id: string;
  name: string;
  address: string;
  description: string;
  lat: number;
  lng: number;
  photos: string;
  metas: string;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

interface NoteRow {
  id: string;
  place_id: string;
  content: string;
  position: number;
  created_at: number;
  updated_at: number;
}

const NOTE_COLUMNS = `id, place_id, content, position, created_at, updated_at`;

function parseJsonArray<T>(raw: string | null, fallback: T[]): T[] {
  if (!raw) return fallback;
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? (value as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function placeFromRow(r: PlaceRow): Place {
  return {
    id: r.id,
    ownerId: r.owner_id,
    name: r.name,
    address: r.address,
    description: r.description,
    lat: r.lat,
    lng: r.lng,
    photos: parseJsonArray<PhotoItem>(r.photos, []).filter(
      (p) => p && typeof p.key === "string" && typeof p.url === "string",
    ),
    metas: parseJsonArray<MetaItem>(r.metas, []).filter(
      (m) =>
        m &&
        typeof m.label === "string" &&
        typeof m.score === "number" &&
        Number.isInteger(m.score),
    ),
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    notes: [],
  };
}

function noteFromRow(r: NoteRow): PlaceNote {
  return {
    id: r.id,
    placeId: r.place_id,
    content: r.content,
    position: r.position,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listPlaces(env: Env, ownerId: string): Promise<Place[]> {
  const rows = await env.DB.prepare(
    `SELECT ${PLACE_COLUMNS} FROM places WHERE owner_id = ? ORDER BY sort_order, created_at`,
  )
    .bind(ownerId)
    .all<PlaceRow>();
  const places = rows.results.map(placeFromRow);
  if (places.length === 0) return [];
  const notes = await env.DB.prepare(
    `SELECT pn.id, pn.place_id, pn.content, pn.position, pn.created_at, pn.updated_at
     FROM place_notes pn JOIN places p ON pn.place_id = p.id
     WHERE p.owner_id = ? ORDER BY p.sort_order, pn.position, pn.created_at`,
  )
    .bind(ownerId)
    .all<NoteRow>();
  const byPlace = new Map<string, PlaceNote[]>();
  for (const n of notes.results) {
    const list = byPlace.get(n.place_id) ?? [];
    list.push(noteFromRow(n));
    byPlace.set(n.place_id, list);
  }
  return places.map((p) => ({ ...p, notes: byPlace.get(p.id) ?? [] }));
}

export async function getPlace(env: Env, placeId: string): Promise<Place | null> {
  const row = await env.DB.prepare(
    `SELECT ${PLACE_COLUMNS} FROM places WHERE id = ?`,
  )
    .bind(placeId)
    .first<PlaceRow>();
  if (!row) return null;
  const place = placeFromRow(row);
  const notes = await env.DB.prepare(
    `SELECT ${NOTE_COLUMNS} FROM place_notes
     WHERE place_id = ? ORDER BY position, created_at`,
  )
    .bind(placeId)
    .all<NoteRow>();
  return { ...place, notes: notes.results.map(noteFromRow) };
}

/** 仅查询地点归属, 用于鉴权路径 (不读取照片/笔记) */
export async function getPlaceOwner(env: Env, placeId: string): Promise<string | null> {
  const row = await env.DB.prepare(
    `SELECT owner_id FROM places WHERE id = ?`,
  )
    .bind(placeId)
    .first<{ owner_id: string }>();
  return row?.owner_id ?? null;
}

export async function createPlace(
  env: Env,
  ownerId: string,
  data: { name: string; address: string; description: string; lat: number; lng: number },
): Promise<Place> {
  const id = newId();
  const ts = now();
  const orderRow = await env.DB.prepare(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM places WHERE owner_id = ?`,
  )
    .bind(ownerId)
    .first<{ next_order: number }>();
  await env.DB.prepare(
    `INSERT INTO places (id, owner_id, name, address, description, lat, lng, photos, metas, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, '[]', '[]', ?, ?, ?)`,
  )
    .bind(
      id,
      ownerId,
      data.name,
      data.address,
      data.description,
      data.lat,
      data.lng,
      orderRow?.next_order ?? 0,
      ts,
      ts,
    )
    .run();
  return (await getPlace(env, id))!;
}

export async function updatePlace(
  env: Env,
  placeId: string,
  changes: Partial<
    Pick<Place, "name" | "address" | "description" | "lat" | "lng" | "photos" | "metas">
  >,
): Promise<Place | null> {
  const ts = now();
  const sets: string[] = [];
  const binds: (string | number | null)[] = [];
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) continue;
    sets.push(`${key} = ?`);
    binds.push(
      key === "photos" || key === "metas" ? JSON.stringify(value) : (value as string | number),
    );
  }
  if (sets.length === 0) return getPlace(env, placeId);
  sets.push("updated_at = ?");
  binds.push(ts, placeId);
  await env.DB.prepare(`UPDATE places SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...binds)
    .run();
  return getPlace(env, placeId);
}

export async function deletePlace(env: Env, placeId: string): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM place_notes WHERE place_id = ?`).bind(placeId),
    env.DB.prepare(`DELETE FROM places WHERE id = ?`).bind(placeId),
  ]);
}

// ---------- 地点笔记 (place_notes) ----------

export async function createPlaceNote(
  env: Env,
  placeId: string,
  content: string,
): Promise<PlaceNote> {
  const id = newId();
  const ts = now();
  const posRow = await env.DB.prepare(
    `SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM place_notes WHERE place_id = ?`,
  )
    .bind(placeId)
    .first<{ next_pos: number }>();
  const position = posRow?.next_pos ?? 0;
  await env.DB.prepare(
    `INSERT INTO place_notes (id, place_id, content, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, placeId, content, position, ts, ts)
    .run();
  return {
    id,
    placeId,
    content,
    position,
    createdAt: ts,
    updatedAt: ts,
  };
}

export async function updatePlaceNote(
  env: Env,
  placeId: string,
  noteId: string,
  changes: { content?: string; position?: number },
): Promise<PlaceNote | null> {
  if (changes.content !== undefined) {
    await env.DB.prepare(
      `UPDATE place_notes SET content = ?, updated_at = ? WHERE id = ? AND place_id = ?`,
    )
      .bind(changes.content, now(), noteId, placeId)
      .run();
  }
  if (changes.position !== undefined && Number.isInteger(changes.position)) {
    const rows = await env.DB.prepare(
      `SELECT ${NOTE_COLUMNS} FROM place_notes
       WHERE place_id = ? ORDER BY position, created_at`,
    )
      .bind(placeId)
      .all<NoteRow>();
    const notes = rows.results;
    const idx = notes.findIndex((n) => n.id === noteId);
    if (idx >= 0) {
      const item = notes.splice(idx, 1)[0];
      const target = Math.max(0, Math.min(changes.position, notes.length));
      notes.splice(target, 0, item);
      await env.DB.batch(
        notes.map((n, i) =>
          env.DB.prepare(`UPDATE place_notes SET position = ?, updated_at = ? WHERE id = ?`)
            .bind(i, now(), n.id),
        ),
      );
    }
  }
  const row = await env.DB.prepare(
    `SELECT ${NOTE_COLUMNS} FROM place_notes WHERE id = ? AND place_id = ?`,
  )
    .bind(noteId, placeId)
    .first<NoteRow>();
  return row ? noteFromRow(row) : null;
}

export async function deletePlaceNote(
  env: Env,
  placeId: string,
  noteId: string,
): Promise<void> {
  await env.DB.prepare(`DELETE FROM place_notes WHERE id = ? AND place_id = ?`)
    .bind(noteId, placeId)
    .run();
}
