import { api } from "~/lib/api";
import type { GeocodeResult } from "~/lib/types";

/** 搜索地址/地点 (可限制在当前位置附近, 用于"选择具体位置"候选列表) */
export async function searchGeocode(
  q: string,
  near?: { lat: number; lng: number },
  limit = 6,
): Promise<GeocodeResult[]> {
  const params = new URLSearchParams({ q: q.slice(0, 200), limit: String(limit) });
  if (near) {
    params.set("nearLat", String(near.lat));
    params.set("nearLng", String(near.lng));
  }
  const data = await api<{ results: GeocodeResult[] }>("/api/geocode?" + params.toString());
  return data.results ?? [];
}

/** 逆地理编码: 坐标 → 最近地址 */
export async function reverseGeocode(lat: number, lng: number): Promise<GeocodeResult | null> {
  const data = await api<{ result: GeocodeResult | null }>(
    "/api/reverse?lat=" + lat + "&lng=" + lng,
  );
  return data.result ?? null;
}

/** 浏览器定位: 返回 Promise<{lat,lng}> */
export function getCurrentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("当前浏览器不支持定位"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }),
      (err) => reject(new Error(err.message || "定位失败")),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  });
}
