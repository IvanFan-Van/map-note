import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage, jsonApi } from "~/lib/api";
import { loadAMap, type AMapLib } from "~/lib/amap";
import { bearing, wgs84ToGcj02 } from "~/lib/coords";
import { getCurrentPosition } from "~/lib/geocode";
import type { Place, PlaceSummary, User } from "~/lib/types";
import { AddPlaceModal, type DraftPoint } from "./AddPlaceModal";
import { ClusterList } from "./ClusterList";
import { NotesDrawer } from "./NotesDrawer";
import { arrowHtml, clusterHtml, pinHtml, PLACE_PIN_COLOR } from "./pinIcon";
import { PlacePopupView } from "./PlacePopupView";
import { closeActivePopup, openReactPopup } from "./reactPopup";
import { SearchBox } from "./SearchBox";

const DEFAULT_CENTER: [number, number] = [104.0, 35.5];
const DEFAULT_ZOOM = 4;
const ROUTE_COLOR = "#ea580c";
const CLUSTER_MAX_ZOOM = 17;
const FIT_MAX_ZOOM = 14;

function toLngLat(point: { lat: number; lng: number }): [number, number] {
  return [point.lng, point.lat];
}

/**
 * 旅行地图主界面:
 * - 全屏高德地图 (GCJ-02 坐标)
 * - 地点标记: 单击弹悬浮信息窗, 双击编辑笔记组
 * - 标记聚合: 缩小后相近标记合并为标记组 (单击列表 / 双击缩放至全部可见)
 * - 路线箭头: 按记录顺序由上一个地点指向最新地点
 */
export default function TravelMap({
  user,
  initialPlaces,
}: {
  user: User;
  initialPlaces: Place[];
}) {
  const [places, setPlaces] = useState<Place[]>(initialPlaces);
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<DraftPoint | null>(null);
  const [notesPlace, setNotesPlace] = useState<PlaceSummary | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const amapRef = useRef<AMapLib | null>(null);
  const mapRef = useRef<AMap.Map | null>(null);
  const clusterRef = useRef<AMap.MarkerCluster | null>(null);
  const routeOverlaysRef = useRef<(AMap.Polyline | AMap.Marker)[]>([]);
  const placesRef = useRef<Place[]>(initialPlaces);
  const hasFittedRef = useRef(false);

  const reloadPlaces = useCallback(async () => {
    try {
      const data = await jsonApi<{ places: Place[] }>("/api/places", "GET");
      setPlaces(data.places ?? []);
    } catch {
      // 保持现状, 下次操作再重试
    }
  }, []);

  const showToast = useCallback((msg: string) => setToast(msg), []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    placesRef.current = places;
  }, [places]);

  /** 缩放到刚好容纳这些点 (限制最大级别, 避免单点过度放大) */
  const fitBounds = useCallback((points: [number, number][], maxZoom: number, avoid: number[]) => {
    const amap = amapRef.current;
    const map = mapRef.current;
    if (!amap || !map || points.length === 0) return;
    const lngs = points.map((p) => p[0]);
    const lats = points.map((p) => p[1]);
    const bounds = new amap.Bounds(
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    );
    map.setBounds(bounds, true, avoid);
    if (map.getZoom() > maxZoom) map.setZoom(maxZoom);
  }, []);

  // ---------- 悬浮信息窗 (点击标记) ----------
  const openPlacePopup = useCallback((place: PlaceSummary) => {
    const amap = amapRef.current;
    const map = mapRef.current;
    if (!amap || !map) return;
    openReactPopup(
      amap,
      map,
      toLngLat(place),
      (close) => (
        <PlacePopupView
          place={place}
          onChanged={() => void reloadPlaces()}
          onClose={close}
          onEditNotes={() => {
            close();
            setNotesPlace(place);
          }}
        />
      ),
      { className: "place-popup", offsetY: -42 },
    );
  }, [reloadPlaces]);

  // ---------- 标记组悬浮列表 (点击聚合标记) ----------
  const openClusterPopup = useCallback((members: PlaceSummary[], position: [number, number]) => {
    if (members.length === 0) return;
    const amap = amapRef.current;
    const map = mapRef.current;
    if (!amap || !map) return;
    openReactPopup(
      amap,
      map,
      position,
      (close) => (
        <ClusterList
          places={members}
          onPick={(p) => {
            close();
            map.setZoomAndCenter(Math.max(map.getZoom(), 15), toLngLat(p), false, 500);
            openPlacePopup(p);
          }}
        />
      ),
      { className: "cluster-popup" },
    );
  }, [openPlacePopup]);

  // 地图事件回调需要引用最新的弹窗函数, 用 ref 避免为此重建地图
  const handlersRef = useRef({ openPlacePopup, openClusterPopup, fitBounds });
  useEffect(() => {
    handlersRef.current = { openPlacePopup, openClusterPopup, fitBounds };
  }, [openPlacePopup, openClusterPopup, fitBounds]);

  // ---------- 初始化地图 (脚本仅客户端加载) ----------
  useEffect(() => {
    let disposed = false;
    let map: AMap.Map | null = null;
    let cluster: AMap.MarkerCluster | null = null;
    let lastClick = { key: "", at: 0 };

    /** 从聚合点击事件中提取成员地点 (兼容不同版本的字段差异) */
    const extractMembers = (event: AMap.ClusterClickEvent): PlaceSummary[] => {
      const members: PlaceSummary[] = [];
      for (const item of event.clusterData ?? []) {
        const place = item.extData as PlaceSummary | undefined;
        if (place) members.push(place);
      }
      if (members.length === 0) {
        for (const marker of event.marker ?? []) {
          const place = marker.getExtData() as PlaceSummary | undefined;
          if (place) members.push(place);
        }
      }
      if (members.length === 0 && event.lnglat) {
        const { lat, lng } = event.lnglat;
        const hit = placesRef.current.find(
          (p) => Math.abs(p.lat - lat) < 1e-6 && Math.abs(p.lng - lng) < 1e-6,
        );
        if (hit) members.push(hit);
      }
      return members;
    };

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
      // ToolBar 是控件插件, 官方类型未提供, 运行时由 plugin 参数加载
      map.addControl(
        new amap.ToolBar({ position: { top: "10px", left: "10px" } }) as unknown as AMap.Control,
      );

      cluster = new amap.MarkerCluster(map, [], {
        gridSize: 70,
        maxZoom: CLUSTER_MAX_ZOOM,
        averageCenter: true,
        renderClusterMarker: (context) => {
          context.marker.setContent(clusterHtml(context.count));
          context.marker.setAnchor("center");
        },
        renderMarker: (context) => {
          const place = context.marker.getExtData() as PlaceSummary | undefined;
          if (!place) return;
          context.marker.setContent(pinHtml(PLACE_PIN_COLOR, { thumbUrl: place.photos[0]?.url }));
          context.marker.setAnchor("bottom-center");
        },
      });

      cluster.on("click", (event) => {
        const members = extractMembers(event);
        if (members.length === 0) return;
        const key = members
          .map((m) => m.id)
          .sort()
          .join(",");
        const nowMs = Date.now();
        const isDoubleClick = lastClick.key === key && nowMs - lastClick.at < 350;
        lastClick = { key, at: nowMs };

        if (members.length > 1 && isDoubleClick) {
          closeActivePopup();
          handlersRef.current.fitBounds(members.map(toLngLat), 16, [80, 80, 80, 80]);
        } else if (members.length === 1) {
          handlersRef.current.openPlacePopup(members[0]);
        } else {
          const center = event.lnglat ?? members[0];
          handlersRef.current.openClusterPopup(members, [center.lng, center.lat]);
        }
      });

      mapRef.current = map;
      clusterRef.current = cluster;
      setReady(true);
    })();

    return () => {
      disposed = true;
      closeActivePopup();
      cluster?.setMap(null);
      map?.destroy();
      mapRef.current = null;
      clusterRef.current = null;
      amapRef.current = null;
      routeOverlaysRef.current = [];
      setReady(false);
    };
  }, [showToast]);

  // ---------- 渲染标记 / 聚合 / 路线箭头 ----------
  useEffect(() => {
    const amap = amapRef.current;
    const map = mapRef.current;
    const cluster = clusterRef.current;
    if (!ready || !amap || !map || !cluster) return;

    routeOverlaysRef.current.forEach((overlay) => overlay.setMap(null));
    routeOverlaysRef.current = [];

    const ordered = [...places].sort((a, b) => a.sortOrder - b.sortOrder);

    // 路线: 白色描边 + 橙色主线, 终点按方位角放置箭头
    for (let i = 0; i + 1 < ordered.length; i++) {
      const a = ordered[i];
      const b = ordered[i + 1];
      const path = [toLngLat(a), toLngLat(b)];
      const casing = new amap.Polyline({
        path,
        strokeColor: "#ffffff",
        strokeWeight: 7,
        strokeOpacity: 0.9,
        lineCap: "round",
        lineJoin: "round",
        zIndex: 20,
      });
      const line = new amap.Polyline({
        path,
        strokeColor: ROUTE_COLOR,
        strokeWeight: 3,
        strokeOpacity: 0.95,
        lineJoin: "round",
        zIndex: 21,
      });
      const arrow = new amap.Marker({
        position: toLngLat(b),
        content: arrowHtml(bearing(a.lat, a.lng, b.lat, b.lng) - 90, ROUTE_COLOR),
        anchor: "center",
        zIndex: 22,
      });
      casing.setMap(map);
      line.setMap(map);
      arrow.setMap(map);
      routeOverlaysRef.current.push(casing, line, arrow);
    }

    cluster.setData(
      ordered.map((p) => ({
        lnglat: toLngLat(p),
        extData: p,
      })),
    );

    // 首次加载时缩放到覆盖全部地点
    if (!hasFittedRef.current) {
      hasFittedRef.current = true;
      if (ordered.length > 0) {
        fitBounds(ordered.map(toLngLat), FIT_MAX_ZOOM, [60, 60, 60, 60]);
      } else {
        map.setZoomAndCenter(DEFAULT_ZOOM, DEFAULT_CENTER, true);
      }
    }
  }, [places, ready, fitBounds]);

  // ---------- 定位到当前位置 (浏览器返回 WGS-84, 需转 GCJ-02) ----------
  const locate = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    void getCurrentPosition()
      .then((pos) => {
        const gcj = wgs84ToGcj02(pos.lat, pos.lng);
        map.setZoomAndCenter(Math.max(map.getZoom(), 15), toLngLat(gcj), false, 600);
        showToast("已定位到当前位置");
      })
      .catch((e) => showToast(errorMessage(e, "定位失败, 请检查浏览器权限")));
  }, [showToast]);

  const startAdd = useCallback(() => {
    setDraft(null);
    setAddOpen(true);
  }, []);

  const handleCreated = useCallback((place: PlaceSummary) => {
    setAddOpen(false);
    setDraft(null);
    void reloadPlaces().then(() => openPlacePopup(place));
  }, [reloadPlaces, openPlacePopup]);

  const map = mapRef.current;

  return (
    <div className="travel-map-root">
      <div ref={containerRef} className="map-container" />
      <header className="map-header">
        <div className="brand">🧭 <span>旅行地图</span></div>
        <div className="header-center">
          <SearchBox
            onPick={(d) => {
              setDraft(d);
              setAddOpen(true);
            }}
          />
        </div>
        <div className="header-actions">
          <button className="header-btn" onClick={locate} disabled={!map} title="定位到当前位置">📍 定位</button>
          <button className="header-btn primary" onClick={startAdd} disabled={!map}>＋ 添加地点</button>
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
        </div>
      </header>

      {toast && <div className="toast">{toast}</div>}

      {addOpen && map && amapRef.current && (
        <AddPlaceModal
          map={map}
          amap={amapRef.current}
          initialDraft={draft}
          onCreated={handleCreated}
          onClose={() => {
            setAddOpen(false);
            setDraft(null);
          }}
        />
      )}

      {notesPlace && (
        <NotesDrawer
          place={notesPlace}
          onClose={() => setNotesPlace(null)}
          onChanged={() => void reloadPlaces()}
        />
      )}
    </div>
  );
}
