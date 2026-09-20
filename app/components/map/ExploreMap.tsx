import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api, errorMessage } from "~/lib/api";
import { loadAMap, type AMapLib } from "~/lib/amap";
import { wgs84ToGcj02 } from "~/lib/coords";
import { getCurrentPosition } from "~/lib/geocode";
import type { DraftPoint, LocationPoint, Post, User } from "~/lib/types";
import { countHtml, pinHtml, POST_PIN_COLOR } from "./pinIcon";
import { PostDrawer } from "./PostDrawer";
import { PostEditorModal } from "./PostEditorModal";
import { SearchBox } from "./SearchBox";

const DEFAULT_CENTER: [number, number] = [104.0, 35.5];
const DEFAULT_ZOOM = 4;
const VIEWPORT_DEBOUNCE_MS = 250;

/**
 * 探索地图:
 * - 全屏高德地图, 展示视野内有帖子的地点 (单个 pin / 多个显示数量)
 * - 点击地点标记 → 底部抽屉列出该地点帖子
 * - 搜索 / 定位 / 拖动选点后发帖
 */
export default function ExploreMap({ user }: { user: User | null }) {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<LocationPoint | null>(null);
  const [editor, setEditor] = useState<{ draft: DraftPoint | null } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const amapRef = useRef<AMapLib | null>(null);
  const mapRef = useRef<AMap.Map | null>(null);
  const markersRef = useRef<Map<string, AMap.Marker>>(new Map());
  const fetchTimerRef = useRef<number | null>(null);

  const showToast = useCallback((msg: string) => setToast(msg), []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  const loadViewport = useCallback(async () => {
    const map = mapRef.current;
    const amap = amapRef.current;
    if (!map || !amap) return;
    const bounds = map.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const bbox = [sw.lng, sw.lat, ne.lng, ne.lat].join(",");
    try {
      const data = await api<{ locations: LocationPoint[] }>("/api/map?bbox=" + bbox);
      const locations = data.locations ?? [];
      const markers = markersRef.current;
      markers.forEach((marker) => marker.setMap(null));
      markers.clear();
      for (const location of locations) {
        const marker = new amap.Marker({
          position: [location.lng, location.lat],
          content:
            location.postCount > 1
              ? countHtml(location.postCount)
              : pinHtml(POST_PIN_COLOR),
          anchor: "bottom-center",
        });
        marker.on("click", () => setSelected(location));
        marker.setMap(map);
        markers.set(location.id, marker);
      }
    } catch {
      // 网络异常时保留当前标记, 下次移动地图再重试
    }
  }, []);

  const scheduleViewportLoad = useCallback(() => {
    if (fetchTimerRef.current) window.clearTimeout(fetchTimerRef.current);
    fetchTimerRef.current = window.setTimeout(() => void loadViewport(), VIEWPORT_DEBOUNCE_MS);
  }, [loadViewport]);

  // ---------- 初始化地图 (脚本仅客户端加载) ----------
  useEffect(() => {
    let disposed = false;
    let map: AMap.Map | null = null;
    void (async () => {
      let amap: AMapLib;
      try {
        amap = await loadAMap();
      } catch (e) {
        if (!disposed) showToast(errorMessage(e, "地图加载失败"));
        return;
      }
      if (disposed || !containerRef.current) return;
      amapRef.current = amap;
      map = new amap.Map(containerRef.current, {
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        viewMode: "2D",
      });
      map.addControl(
        new amap.ToolBar({ position: { top: "10px", left: "10px" } }) as unknown as AMap.Control,
      );
      map.on("moveend", scheduleViewportLoad);
      mapRef.current = map;
      setReady(true);
      void loadViewport();
    })();

    return () => {
      disposed = true;
      if (fetchTimerRef.current) window.clearTimeout(fetchTimerRef.current);
      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current.clear();
      map?.destroy();
      mapRef.current = null;
      amapRef.current = null;
      setReady(false);
    };
  }, [showToast, scheduleViewportLoad, loadViewport]);

  // ---------- 定位到当前位置 (浏览器返回 WGS-84, 需转 GCJ-02) ----------
  const locate = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    void getCurrentPosition()
      .then((pos) => {
        const gcj = wgs84ToGcj02(pos.lat, pos.lng);
        map.setZoomAndCenter(Math.max(map.getZoom(), 15), [gcj.lng, gcj.lat], false, 600);
        showToast("已定位到当前位置");
      })
      .catch((e) => showToast(errorMessage(e, "定位失败, 请检查浏览器权限")));
  }, [showToast]);

  const startCreate = useCallback(
    (draft: DraftPoint | null) => {
      if (!user) {
        navigate("/auth/login");
        return;
      }
      setSelected(null);
      setEditor({ draft });
    },
    [user, navigate],
  );

  const handleCreated = useCallback(
    (post: Post) => {
      setEditor(null);
      void loadViewport();
      navigate("/posts/" + post.id);
    },
    [loadViewport, navigate],
  );

  const map = mapRef.current;

  return (
    <div className="travel-map-root">
      <div ref={containerRef} className="map-container" />
      <header className="map-header">
        <Link to="/" className="brand">🧭 <span>地图探索</span></Link>
        <div className="header-center">
          <SearchBox onPick={(d) => startCreate(d)} />
        </div>
        <div className="header-actions">
          <button className="header-btn" onClick={locate} disabled={!map} title="定位到当前位置">📍 定位</button>
          <button className="header-btn primary" onClick={() => startCreate(null)} disabled={!map}>
            ＋ 发帖
          </button>
          {user ? (
            <div className="user-chip">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="user-avatar" />
              ) : (
                <span className="user-avatar">{user.name.slice(0, 1)}</span>
              )}
              <span className="user-name">{user.name}</span>
              <form method="post" action="/auth/logout">
                <button className="logout-btn" title="退出登录">退出</button>
              </form>
            </div>
          ) : (
            <Link to="/auth/login" className="header-btn">登录</Link>
          )}
        </div>
      </header>

      {toast && <div className="toast">{toast}</div>}

      {ready && selected && (
        <PostDrawer
          location={selected}
          user={user}
          onClose={() => setSelected(null)}
          onCreateHere={() =>
            startCreate({
              lat: selected.lat,
              lng: selected.lng,
              name: selected.name,
              address: selected.address,
            })
          }
        />
      )}

      {ready && editor && map && amapRef.current && (
        <PostEditorModal
          map={map}
          amap={amapRef.current}
          initialDraft={editor.draft}
          onCreated={handleCreated}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}
