import type { GeocodeResult } from "~/lib/types";

const BASE = "https://nominatim.openstreetmap.org";
const UA = "co-note-travel-map/1.0 (https://co-note.ivanfan.com)";

async function fetchWithTimeout(url: string, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
  } finally {
    clearTimeout(timer);
  }
}

interface NominatimHit {
  lat?: string;
  lon?: string;
  name?: string;
  display_name?: string;
}

function toResult(hit: NominatimHit): GeocodeResult | null {
  const lat = Number(hit.lat);
  const lng = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    lat,
    lng,
    name: (hit.name ?? hit.display_name ?? "").slice(0, 80),
    displayName: (hit.display_name ?? "").slice(0, 300),
  };
}

/** 地址搜索 (q 支持关键词; near 用于限制在当前位置附近) */
export async function searchPlaces(
  q: string,
  near?: { lat: number; lng: number },
  limit = 5,
): Promise<GeocodeResult[]> {
  const url = new URL(`${BASE}/search`);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", String(Math.min(Math.max(limit, 1), 10)));
  url.searchParams.set("accept-language", "zh-CN");
  if (near) {
    const d = 0.02;
    url.searchParams.set("viewbox", [near.lng - d, near.lat + d, near.lng + d, near.lat - d].join(","));
    url.searchParams.set("bounded", "1");
  }
  const res = await fetchWithTimeout(url.toString());
  if (!res.ok) throw new Error("geocode failed");
  const hits = (await res.json()) as NominatimHit[];
  return hits.map(toResult).filter((r): r is GeocodeResult => r !== null);
}

/** 逆地理编码: 坐标 → 地址 */
export async function reverseGeocode(lat: number, lng: number): Promise<GeocodeResult | null> {
  const url = new URL(`${BASE}/reverse`);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("zoom", "18");
  url.searchParams.set("accept-language", "zh-CN");
  const res = await fetchWithTimeout(url.toString());
  if (!res.ok) throw new Error("reverse failed");
  const hit = (await res.json()) as NominatimHit;
  return toResult(hit);
}
