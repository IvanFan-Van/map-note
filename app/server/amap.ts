import type { GeocodeResult } from "~/lib/types";

/** 高德 Web 服务 API (服务端调用, 坐标为 GCJ-02) */
const BASE = "https://restapi.amap.com/v3";

/** 高德对缺失字段返回空数组, 取值统一收敛为字符串 */
type AmapText = string | unknown[];

interface AmapPoi {
  id?: AmapText;
  name?: AmapText;
  address?: AmapText;
  pname?: AmapText;
  cityname?: AmapText;
  adname?: AmapText;
  location?: AmapText;
}

interface AmapStreetNumber {
  street?: AmapText;
  number?: AmapText;
}

interface AmapAddressComponent {
  township?: AmapText;
  streetNumber?: AmapStreetNumber;
}

interface AmapBaseResponse {
  status?: string;
  info?: string;
  infocode?: string;
}

interface TextResponse extends AmapBaseResponse {
  pois?: AmapPoi[];
}

interface RegeoResponse extends AmapBaseResponse {
  regeocode?: {
    formatted_address?: AmapText;
    addressComponent?: AmapAddressComponent;
    pois?: AmapPoi[];
  };
}

function asText(value: AmapText | undefined): string {
  return typeof value === "string" ? value : "";
}

function parseLocation(value: AmapText | undefined): { lat: number; lng: number } | null {
  if (typeof value !== "string") return null;
  const [lngRaw, latRaw] = value.split(",");
  const lng = Number(lngRaw);
  const lat = Number(latRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/** 拼接地址展示文本, 过滤空段与连续重复段 (pname 与 cityname 常常相同) */
function joinDisplay(...parts: (AmapText | undefined)[]): string {
  const seen = new Set<string>();
  const segments: string[] = [];
  for (const part of parts) {
    const text = asText(part);
    if (text && !seen.has(text)) {
      seen.add(text);
      segments.push(text);
    }
  }
  return segments.join("");
}

async function fetchAmap<T extends AmapBaseResponse>(url: URL): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error("amap http " + res.status);
    const data = (await res.json()) as T;
    if (data.status !== "1") {
      throw new Error("amap error: " + (data.info ?? data.infocode ?? "unknown"));
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/** 地址/POI 搜索 (near 存在时按距离排序, 限制在附近范围内) */
export async function searchPlaces(
  key: string,
  q: string,
  near?: { lat: number; lng: number },
  limit = 5,
): Promise<GeocodeResult[]> {
  const url = new URL(`${BASE}/place/text`);
  url.searchParams.set("key", key);
  url.searchParams.set("keywords", q);
  url.searchParams.set("offset", String(Math.min(Math.max(limit, 1), 25)));
  url.searchParams.set("page", "1");
  url.searchParams.set("extensions", "base");
  if (near) {
    url.searchParams.set("location", near.lng + "," + near.lat);
    url.searchParams.set("radius", "3000");
    url.searchParams.set("sortrule", "distance");
  }
  const data = await fetchAmap<TextResponse>(url);
  const results: GeocodeResult[] = [];
  for (const poi of data.pois ?? []) {
    const loc = parseLocation(poi.location);
    if (!loc) continue;
    results.push({
      lat: loc.lat,
      lng: loc.lng,
      name: asText(poi.name).slice(0, 80),
      displayName: joinDisplay(poi.pname, poi.cityname, poi.adname, poi.address).slice(0, 300),
      amapPoiId: asText(poi.id) || undefined,
    });
  }
  return results;
}

/** 逆地理编码: 坐标 → 地址 */
export async function reverseGeocode(
  key: string,
  lat: number,
  lng: number,
): Promise<GeocodeResult | null> {
  const url = new URL(`${BASE}/geocode/regeo`);
  url.searchParams.set("key", key);
  url.searchParams.set("location", lng + "," + lat);
  url.searchParams.set("extensions", "all");
  url.searchParams.set("radius", "1000");
  const data = await fetchAmap<RegeoResponse>(url);
  const regeo = data.regeocode;
  if (!regeo) return null;
  const street = regeo.addressComponent?.streetNumber;
  const streetText = asText(street?.street) + asText(street?.number);
  const name = asText(regeo.pois?.[0]?.name) || streetText || asText(regeo.addressComponent?.township);
  const displayName =
    asText(regeo.formatted_address) ||
    joinDisplay(regeo.addressComponent?.township, street?.street, street?.number);
  return {
    lat,
    lng,
    name: name.slice(0, 80),
    displayName: displayName.slice(0, 300),
    amapPoiId: asText(regeo.pois?.[0]?.id) || undefined,
  };
}
