/**
 * 将 places 表中的 WGS-84 坐标批量转换为 GCJ-02 (高德/火星坐标)。
 *
 * 用法:
 *   pnpm db:coords            # 本地 D1
 *   pnpm db:coords --remote   # 远程 D1 (生产)
 *
 * 幂等: 只处理 coord_system = 'wgs84' 的行, 转换后标记为 'gcj02'。
 * 注意: 转换算法与 app/lib/coords.ts 保持一致, 修改时需同步。
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DB_NAME = "co-note";
const remote = process.argv.includes("--remote");
const target = remote ? "--remote" : "--local";

function wrangler(args) {
  const bin = join(process.cwd(), "node_modules", "wrangler", "bin", "wrangler.js");
  const stdout = execFileSync(process.execPath, [bin, ...args], { encoding: "utf8" });
  const start = stdout.indexOf("[");
  const end = stdout.lastIndexOf("]");
  if (start < 0 || end < 0) throw new Error("无法解析 wrangler 输出:\n" + stdout);
  return JSON.parse(stdout.slice(start, end + 1));
}

// ---------- WGS-84 → GCJ-02 (与 app/lib/coords.ts 相同) ----------

const A = 6378245.0;
const EE = 0.00669342162296594;

function outOfChina(lat, lng) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(lng, lat) {
  let ret = -100.0 + 2.0 * lng + 3.0 * lat + 0.2 * lat * lat + 0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng));
  ret += ((20.0 * Math.sin(6.0 * lng * Math.PI) + 20.0 * Math.sin(2.0 * lng * Math.PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(lat * Math.PI) + 40.0 * Math.sin((lat / 3.0) * Math.PI)) * 2.0) / 3.0;
  ret += ((160.0 * Math.sin((lat / 12.0) * Math.PI) + 320 * Math.sin((lat * Math.PI) / 30.0)) * 2.0) / 3.0;
  return ret;
}

function transformLng(lng, lat) {
  let ret = 300.0 + lng + 2.0 * lat + 0.1 * lng * lng + 0.1 * lng * lat + 0.1 * Math.sqrt(Math.abs(lng));
  ret += ((20.0 * Math.sin(6.0 * lng * Math.PI) + 20.0 * Math.sin(2.0 * lng * Math.PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(lng * Math.PI) + 40.0 * Math.sin((lng / 3.0) * Math.PI)) * 2.0) / 3.0;
  ret += ((150.0 * Math.sin((lng / 12.0) * Math.PI) + 300.0 * Math.sin((lng / 30.0) * Math.PI)) * 2.0) / 3.0;
  return ret;
}

function wgs84ToGcj02(lat, lng) {
  if (outOfChina(lat, lng)) return { lat, lng };
  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * Math.PI);
  dLng = (dLng * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * Math.PI);
  return { lat: lat + dLat, lng: lng + dLng };
}

// ---------- 主流程 ----------

const [result] = wrangler([
  "d1",
  "execute",
  DB_NAME,
  target,
  "--json",
  "--command",
  "SELECT id, lat, lng FROM places WHERE coord_system = 'wgs84'",
]);
const rows = result?.results ?? [];
if (rows.length === 0) {
  console.log("没有需要转换的地点");
  process.exit(0);
}

const statements = rows.map((row) => {
  const gcj = wgs84ToGcj02(Number(row.lat), Number(row.lng));
  const id = String(row.id).replaceAll("'", "''");
  return (
    `UPDATE places SET lat = ${gcj.lat.toFixed(6)}, lng = ${gcj.lng.toFixed(6)}, ` +
    `coord_system = 'gcj02' WHERE id = '${id}' AND coord_system = 'wgs84';`
  );
});

const dir = mkdtempSync(join(tmpdir(), "co-note-gcj-"));
const file = join(dir, "convert.sql");
writeFileSync(file, statements.join("\n"), "utf8");
try {
  wrangler(["d1", "execute", DB_NAME, target, "--file", file]);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(`已转换 ${rows.length} 个地点 (${remote ? "远程" : "本地"} D1)`);
