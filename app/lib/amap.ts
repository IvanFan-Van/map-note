export type AMapLib = typeof AMap;

const SCRIPT_ID = "amap-jsapi";
const PLUGINS = ["AMap.MarkerCluster", "AMap.ToolBar"];

let loadPromise: Promise<AMapLib> | null = null;

/**
 * 加载高德地图 JS API 2.0 (仅浏览器可用)。
 * Key 与安全密钥从构建时环境变量读取, 脚本只加载一次。
 */
export function loadAMap(): Promise<AMapLib> {
  if (loadPromise) return loadPromise;
  const key = import.meta.env.VITE_AMAP_KEY;
  if (!key) return Promise.reject(new Error("未配置高德地图 Key (VITE_AMAP_KEY)"));
  const securityCode = import.meta.env.VITE_AMAP_SECURITY_CODE;
  if (securityCode) {
    window._AMapSecurityConfig = { securityJsCode: securityCode };
  }
  loadPromise = new Promise<AMapLib>((resolve, reject) => {
    const done = () => {
      if (window.AMap) resolve(window.AMap);
      else reject(new Error("高德地图加载失败"));
    };
    if (window.AMap) {
      done();
      return;
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}&plugin=${PLUGINS.join(",")}`;
    script.onload = done;
    script.onerror = () => reject(new Error("高德地图脚本加载失败, 请检查网络与 Key 配置"));
    document.head.appendChild(script);
  });
  return loadPromise;
}
