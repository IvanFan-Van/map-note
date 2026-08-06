import { apiError } from "~/lib/api";
import { requireUser } from "~/server/auth";
import { getBoardDetail, newId } from "~/server/db";
import { assertEditor } from "~/server/permissions";
import type { Route } from "./+types/stickers";

// ---------- GIPHY 表情包 (服务端代理, key 不暴露; 转存 R2 防外链过期) ----------

const GIPHY_API = "https://api.giphy.com/v1/gifs";

interface GiphyItem {
  id: string;
  images?: {
    downsized?: { url?: string };
    fixed_width?: { url?: string };
  };
}

export interface StickerItem {
  id: string;
  preview: string;
  full: string;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireUser(request, env);
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const offset = Math.min(Math.max(Number(url.searchParams.get("offset") ?? 0), 0), 500);
  const endpoint = q
    ? `${GIPHY_API}/search?api_key=${env.GIPHY_API_KEY}&q=${encodeURIComponent(
        q,
      )}&limit=18&offset=${offset}&lang=zh`
    : `${GIPHY_API}/trending?api_key=${env.GIPHY_API_KEY}&limit=18&offset=${offset}`;
  const res = await fetch(endpoint);
  if (!res.ok) {
    return apiError(502, "STICKER_ERROR", "表情服务暂不可用");
  }
  const data = (await res.json()) as { data?: GiphyItem[] };
  const items: StickerItem[] = (data.data ?? []).map((g) => ({
    id: g.id,
    preview: g.images?.downsized?.url ?? g.images?.fixed_width?.url ?? "",
    full: g.images?.downsized?.url ?? "",
  }));
  return { ok: true, data: { items } };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  if (request.method !== "POST") {
    return apiError(405, "METHOD_NOT_ALLOWED", "不支持的请求方法");
  }
  const body = (await request.json().catch(() => ({}))) as {
    url?: unknown;
    boardId?: unknown;
  };
  const url = String(body.url ?? "");
  const boardId = String(body.boardId ?? "");
  // 只允许下载 GIPHY 域资源, 防 SSRF
  if (!/^https:\/\/media[0-9]*\.giphy\.com\//.test(url)) {
    return apiError(400, "INVALID_URL", "无效的表情地址");
  }
  const board = await getBoardDetail(env, boardId, user.id);
  if (!board) {
    return apiError(403, "FORBIDDEN", "你不是该背景板的成员");
  }
  await assertEditor(env, boardId, user.id);
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    return apiError(502, "STICKER_ERROR", "表情下载失败");
  }
  const key = `boards/${boardId}/stickers/${newId()}.gif`;
  await env.IMAGES.put(key, res.body, {
    httpMetadata: { contentType: "image/gif" },
  });
  return { ok: true, data: { url: `/images/${key}` } };
}
