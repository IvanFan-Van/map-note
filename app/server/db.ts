import type { LocationPoint, Post, PostMedia, PostSummary, User } from "~/lib/types";
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

export async function updateUserName(env: Env, userId: string, name: string): Promise<void> {
  await env.DB.prepare(`UPDATE users SET name = ? WHERE id = ?`)
    .bind(name, userId)
    .run();
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

// ---------- 地点 (locations) ----------

const LOCATION_COLUMNS = `id, name, address, lat, lng, post_count`;

interface LocationRow {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  post_count: number;
}

function locationFromRow(r: LocationRow): LocationPoint {
  return {
    id: r.id,
    name: r.name,
    address: r.address,
    lat: r.lat,
    lng: r.lng,
    postCount: r.post_count,
  };
}

/** 无 POI 时按坐标邻近匹配的容差 (约 55m) */
const NEARBY_DEGREE = 0.0005;

export async function getLocationById(env: Env, id: string): Promise<LocationPoint | null> {
  const row = await env.DB.prepare(
    `SELECT ${LOCATION_COLUMNS} FROM locations WHERE id = ?`,
  )
    .bind(id)
    .first<LocationRow>();
  return row ? locationFromRow(row) : null;
}

/**
 * 发帖定位归一化: 优先按高德 POI ID 匹配; 否则在附近容差内找最近地点;
 * 都不存在时创建新地点。
 */
export async function findOrCreateLocation(
  env: Env,
  input: { name: string; address: string; lat: number; lng: number; amapPoiId?: string },
): Promise<LocationPoint> {
  if (input.amapPoiId) {
    const row = await env.DB.prepare(
      `SELECT ${LOCATION_COLUMNS} FROM locations WHERE amap_poi_id = ?`,
    )
      .bind(input.amapPoiId)
      .first<LocationRow>();
    if (row) return locationFromRow(row);
  }
  const nearby = await env.DB.prepare(
    `SELECT ${LOCATION_COLUMNS} FROM locations
     WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?
     LIMIT 20`,
  )
    .bind(
      input.lat - NEARBY_DEGREE,
      input.lat + NEARBY_DEGREE,
      input.lng - NEARBY_DEGREE,
      input.lng + NEARBY_DEGREE,
    )
    .all<LocationRow>();
  let nearest: LocationRow | null = null;
  let nearestDist = Infinity;
  for (const row of nearby.results) {
    const dLat = row.lat - input.lat;
    const dLng = (row.lng - input.lng) * Math.cos((input.lat * Math.PI) / 180);
    const dist = dLat * dLat + dLng * dLng;
    if (dist < nearestDist) {
      nearest = row;
      nearestDist = dist;
    }
  }
  if (nearest && nearestDist <= NEARBY_DEGREE * NEARBY_DEGREE) {
    return locationFromRow(nearest);
  }
  const id = newId();
  const ts = now();
  await env.DB.prepare(
    `INSERT INTO locations (id, name, address, lat, lng, amap_poi_id, post_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
  )
    .bind(id, input.name, input.address, input.lat, input.lng, input.amapPoiId ?? null, ts, ts)
    .run();
  return { id, name: input.name, address: input.address, lat: input.lat, lng: input.lng, postCount: 0 };
}

/** 地图视野内的地点 (只返回有公开帖子的地点) */
export async function listLocationsInBounds(
  env: Env,
  bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number },
  limit = 500,
): Promise<LocationPoint[]> {
  const rows = await env.DB.prepare(
    `SELECT ${LOCATION_COLUMNS} FROM locations
     WHERE post_count > 0 AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?
     ORDER BY post_count DESC
     LIMIT ?`,
  )
    .bind(bounds.minLat, bounds.maxLat, bounds.minLng, bounds.maxLng, limit)
    .all<LocationRow>();
  return rows.results.map(locationFromRow);
}

/** 重新计算地点的公开帖子数量 (冗余列, 发帖/改可见性/删帖后调用) */
export async function recountLocationPosts(env: Env, locationId: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE locations
     SET post_count = (SELECT COUNT(*) FROM posts WHERE location_id = ? AND visibility = 'public'),
         updated_at = ?
     WHERE id = ?`,
  )
    .bind(locationId, now(), locationId)
    .run();
}

// ---------- 帖子 (posts) ----------

const POST_COLUMNS = `p.id, p.author_id, p.location_id, p.lat, p.lng, p.place_name, p.address,
  p.title, p.content, p.cover_url, p.visibility, p.created_at, p.updated_at,
  u.name AS author_name, u.avatar_url AS author_avatar`;

interface PostRow {
  id: string;
  author_id: string;
  location_id: string;
  lat: number;
  lng: number;
  place_name: string;
  address: string;
  title: string;
  content: string;
  cover_url: string | null;
  visibility: "public" | "private";
  created_at: number;
  updated_at: number;
  author_name: string | null;
  author_avatar: string | null;
}

interface MediaRow {
  id: string;
  kind: "image" | "video";
  r2_key: string;
  width: number;
  height: number;
  position: number;
}

function mediaFromRow(r: MediaRow): PostMedia {
  return {
    id: r.id,
    kind: r.kind,
    key: r.r2_key,
    url: "/images/" + r.r2_key,
    width: r.width,
    height: r.height,
    position: r.position,
  };
}

function postFromRow(r: PostRow, media: PostMedia[]): Post {
  return {
    id: r.id,
    authorId: r.author_id,
    locationId: r.location_id,
    lat: r.lat,
    lng: r.lng,
    placeName: r.place_name,
    address: r.address,
    title: r.title,
    content: r.content,
    coverUrl: r.cover_url,
    visibility: r.visibility,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    media,
    author: r.author_name
      ? { id: r.author_id, name: r.author_name, avatarUrl: r.author_avatar }
      : null,
  };
}

export async function listPostMedia(env: Env, postId: string): Promise<PostMedia[]> {
  const rows = await env.DB.prepare(
    `SELECT id, kind, r2_key, width, height, position FROM post_media
     WHERE post_id = ? ORDER BY position, created_at`,
  )
    .bind(postId)
    .all<MediaRow>();
  return rows.results.map(mediaFromRow);
}

export async function getPost(env: Env, postId: string): Promise<Post | null> {
  const row = await env.DB.prepare(
    `SELECT ${POST_COLUMNS} FROM posts p LEFT JOIN users u ON u.id = p.author_id WHERE p.id = ?`,
  )
    .bind(postId)
    .first<PostRow>();
  if (!row) return null;
  return postFromRow(row, await listPostMedia(env, postId));
}

export async function createPost(
  env: Env,
  authorId: string,
  input: {
    locationId: string;
    lat: number;
    lng: number;
    placeName: string;
    address: string;
    title: string;
    content: string;
    visibility: "public" | "private";
  },
): Promise<Post> {
  const id = newId();
  const ts = now();
  await env.DB.prepare(
    `INSERT INTO posts (id, author_id, location_id, lat, lng, place_name, address,
       title, content, cover_url, visibility, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
  )
    .bind(
      id,
      authorId,
      input.locationId,
      input.lat,
      input.lng,
      input.placeName,
      input.address,
      input.title,
      input.content,
      input.visibility,
      ts,
      ts,
    )
    .run();
  await recountLocationPosts(env, input.locationId);
  return (await getPost(env, id))!;
}

export async function updatePost(
  env: Env,
  postId: string,
  changes: Partial<Pick<Post, "title" | "content" | "visibility">>,
): Promise<Post | null> {
  const sets: string[] = [];
  const binds: (string | number)[] = [];
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) continue;
    sets.push(`${key} = ?`);
    binds.push(value as string);
  }
  if (sets.length === 0) return getPost(env, postId);
  sets.push(`updated_at = ?`);
  binds.push(now());
  await env.DB.prepare(`UPDATE posts SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...binds, postId)
    .run();
  const post = await getPost(env, postId);
  if (post) await recountLocationPosts(env, post.locationId);
  return post;
}

/** 删除帖子及其媒体记录; 返回 R2 中需要清理的 key */
export async function deletePost(
  env: Env,
  postId: string,
): Promise<{ mediaKeys: string[]; locationId: string } | null> {
  const post = await getPost(env, postId);
  if (!post) return null;
  await env.DB.prepare(`DELETE FROM post_media WHERE post_id = ?`).bind(postId).run();
  await env.DB.prepare(`DELETE FROM posts WHERE id = ?`).bind(postId).run();
  await recountLocationPosts(env, post.locationId);
  return { mediaKeys: post.media.map((m) => m.key), locationId: post.locationId };
}

/** 供图片访问鉴权: 帖子作者与可见性 */
export async function getPostAccess(
  env: Env,
  postId: string,
): Promise<{ authorId: string; visibility: "public" | "private" } | null> {
  const row = await env.DB.prepare(
    `SELECT author_id, visibility FROM posts WHERE id = ?`,
  )
    .bind(postId)
    .first<{ author_id: string; visibility: "public" | "private" }>();
  return row ? { authorId: row.author_id, visibility: row.visibility } : null;
}

/** 抽屉列表: 公开帖子 + 登录者自己的私密帖子, 游标分页 (created_at + id) */
export async function listLocationPosts(
  env: Env,
  locationId: string,
  viewerId: string | null,
  cursor: string | null,
  limit = 20,
): Promise<{ posts: PostSummary[]; nextCursor: string | null }> {
  const conditions = [`p.location_id = ?`, `(p.visibility = 'public' OR p.author_id = ?)`];
  const binds: (string | number)[] = [locationId, viewerId ?? ""];
  if (cursor) {
    const [createdAtRaw, id] = cursor.split(":");
    const createdAt = Number(createdAtRaw);
    if (Number.isFinite(createdAt) && id) {
      conditions.push(`(p.created_at < ? OR (p.created_at = ? AND p.id < ?))`);
      binds.push(createdAt, createdAt, id);
    }
  }
  const rows = await env.DB.prepare(
    `SELECT p.id, p.title, p.cover_url, p.created_at,
       u.name AS author_name, u.avatar_url AS author_avatar, p.author_id
     FROM posts p LEFT JOIN users u ON u.id = p.author_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY p.created_at DESC, p.id DESC
     LIMIT ?`,
  )
    .bind(...binds, limit + 1)
    .all<{
      id: string;
      title: string;
      cover_url: string | null;
      created_at: number;
      author_name: string | null;
      author_avatar: string | null;
      author_id: string;
    }>();
  const hasMore = rows.results.length > limit;
  const page = hasMore ? rows.results.slice(0, limit) : rows.results;
  const posts: PostSummary[] = page.map((r) => ({
    id: r.id,
    title: r.title,
    coverUrl: r.cover_url,
    createdAt: r.created_at,
    author: r.author_name
      ? { id: r.author_id, name: r.author_name, avatarUrl: r.author_avatar }
      : null,
  }));
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? `${last.created_at}:${last.id}` : null;
  return { posts, nextCursor };
}

export async function addPostMedia(
  env: Env,
  postId: string,
  input: { key: string; width: number; height: number },
): Promise<PostMedia> {
  const id = newId();
  const ts = now();
  const orderRow = await env.DB.prepare(
    `SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM post_media WHERE post_id = ?`,
  )
    .bind(postId)
    .first<{ next_position: number }>();
  await env.DB.prepare(
    `INSERT INTO post_media (id, post_id, kind, r2_key, width, height, position, created_at)
     VALUES (?, ?, 'image', ?, ?, ?, ?, ?)`,
  )
    .bind(id, postId, input.key, input.width, input.height, orderRow?.next_position ?? 0, ts)
    .run();
  const url = "/images/" + input.key;
  await env.DB.prepare(
    `UPDATE posts SET cover_url = COALESCE(cover_url, ?), updated_at = ? WHERE id = ?`,
  )
    .bind(url, ts, postId)
    .run();
  return { id, kind: "image", key: input.key, url, width: input.width, height: input.height, position: orderRow?.next_position ?? 0 };
}

/** 删除单张媒体; 若删除的是封面则顺延到下一张 */
export async function deletePostMedia(
  env: Env,
  mediaId: string,
): Promise<{ key: string; postId: string } | null> {
  const row = await env.DB.prepare(
    `SELECT id, post_id, r2_key FROM post_media WHERE id = ?`,
  )
    .bind(mediaId)
    .first<{ id: string; post_id: string; r2_key: string }>();
  if (!row) return null;
  await env.DB.prepare(`DELETE FROM post_media WHERE id = ?`).bind(mediaId).run();
  const next = await env.DB.prepare(
    `SELECT r2_key FROM post_media WHERE post_id = ? ORDER BY position, created_at LIMIT 1`,
  )
    .bind(row.post_id)
    .first<{ r2_key: string }>();
  await env.DB.prepare(
    `UPDATE posts SET cover_url = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(next ? "/images/" + next.r2_key : null, now(), row.post_id)
    .run();
  return { key: row.r2_key, postId: row.post_id };
}
