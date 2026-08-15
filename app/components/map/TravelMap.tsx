import { useCallback, useEffect, useRef, useState } from "react";
import type * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { jsonApi } from "~/lib/api";
import { getCurrentPosition } from "~/lib/geocode";
import type { Place, PlaceSummary, User } from "~/lib/types";
import { AddPlaceModal, type DraftPoint } from "./AddPlaceModal";
import { ClusterList } from "./ClusterList";
import { NotesDrawer } from "./NotesDrawer";
import { PlacePopupView } from "./PlacePopupView";
import { openReactPopup, type LeafletLib } from "./reactPopup";
import { SearchBox } from "./SearchBox";

const DEFAULT_CENTER: [number, number] = [35.5, 104.0];
const DEFAULT_ZOOM = 4;
const ROUTE_COLOR = "#ea580c";

/**
 * 旅行地图主界面:
 * - 全屏 Leaflet 地图 (OSM 瓦片)
 * - 地点标记: 点击弹悬浮信息窗, 双击编辑笔记组
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
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const arrowsRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const leafletLibRef = useRef<LeafletLib | null>(null);
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

  // ---------- 初始化地图 (仅客户端动态加载 leaflet) ----------
  useEffect(() => {
    let disposed = false;
    let map: L.Map | null = null;
    (async () => {
      const Lmod = ((await import("leaflet")) as unknown as { default: LeafletLib }).default;
      await import("leaflet.markercluster");
      await import("leaflet-polylinedecorator");
      if (disposed || !containerRef.current) return;
      leafletLibRef.current = Lmod;

      map = Lmod.map(containerRef.current, {
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        zoomControl: true,
      });
      Lmod.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      const cluster = Lmod.markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 70,
        zoomToBoundsOnClick: false,
        spiderfyOnMaxZoom: true,
        iconCreateFunction: (c: L.MarkerCluster) =>
          Lmod.divIcon({
            html: '<div class="cluster-icon"><span>' + c.getChildCount() + "</span></div>",
            className: "cluster-icon-wrap",
            iconSize: [42, 42],
            iconAnchor: [21, 21],
          }),
      });
      cluster.addTo(map);
      const arrows = Lmod.layerGroup().addTo(map);

      cluster.on("click", (e: L.LeafletMouseEvent) => {
        const layer = e.layer as L.Marker & { place?: PlaceSummary };
        if (layer && typeof (layer as { getAllChildMarkers?: unknown }).getAllChildMarkers === "function") {
          const members = ((layer as unknown as { getAllChildMarkers: () => L.Marker[] }).getAllChildMarkers())
            .map((m) => (m as L.Marker & { place?: PlaceSummary }).place)
            .filter((p): p is PlaceSummary => Boolean(p));
          openClusterPopup(map!, members);
        } else if (layer?.place) {
          openPlacePopup(map!, layer.place);
        }
      });
      cluster.on("dblclick", (e: L.LeafletMouseEvent) => {
        const layer = e.layer as L.Marker & { place?: PlaceSummary };
        if (layer && typeof (layer as { getAllChildMarkers?: unknown }).getAllChildMarkers === "function") {
          const bounds = (layer as unknown as { getBounds: () => L.LatLngBounds }).getBounds();
          map?.fitBounds(bounds.pad(0.25), { maxZoom: 16 });
        } else if (layer?.place) {
          setNotesPlace(layer.place);
        }
      });

      mapRef.current = map;
      clusterRef.current = cluster;
      arrowsRef.current = arrows;
      setReady(true);
    })();
    return () => {
      disposed = true;
      map?.remove();
      mapRef.current = null;
      clusterRef.current = null;
      arrowsRef.current = null;
      markersRef.current.clear();
      setReady(false);
    };
  }, []);

  // ---------- 渲染标记 / 聚合 / 路线箭头 ----------
  useEffect(() => {
    const map = mapRef.current;
    const cluster = clusterRef.current;
    const arrows = arrowsRef.current;
    const Lmod = leafletLibRef.current;
    if (!map || !cluster || !arrows || !Lmod || !ready) return;

    markersRef.current.forEach((m) => cluster.removeLayer(m));
    markersRef.current.clear();
    arrows.clearLayers();

    const ordered = [...places].sort((a, b) => a.sortOrder - b.sortOrder);

    // 路线箭头: 由上一个地点指向最新地点
    for (let i = 0; i + 1 < ordered.length; i++) {
      const a = ordered[i];
      const b = ordered[i + 1];
      const pts: [number, number][] = [[a.lat, a.lng], [b.lat, b.lng]];
      Lmod.polyline(pts, { color: "#ffffff", weight: 7, opacity: 0.9, lineCap: "round" }).addTo(arrows);
      const line = Lmod.polyline(pts, { color: ROUTE_COLOR, weight: 3, opacity: 0.95 }).addTo(arrows);
      (Lmod as unknown as { polylineDecorator: (l: L.Polyline, o: unknown) => L.Layer }).polylineDecorator(line, {
        patterns: [
          {
            offset: "100%",
            repeat: 0,
            symbol: (Lmod as unknown as { Symbol: { arrowHead: (o: unknown) => unknown } }).Symbol.arrowHead({
              pixelSize: 13,
              polygon: false,
              pathOptions: { stroke: true, color: ROUTE_COLOR, weight: 3 },
            }),
          },
        ],
      }).addTo(arrows);
    }

    for (const p of ordered) {
      const thumb = p.photos[0]
        ? '<span class="pin-thumb" style="background-image:url(\'' + p.photos[0].url + '\')"></span>'
        : "";
      const icon = Lmod.divIcon({
        className: "place-pin-wrap",
        html: '<div class="place-pin"><svg viewBox="0 0 30 42" width="30" height="42"><path d="M15 1C7.8 1 2 6.8 2 14c0 9.6 13 26 13 26s13-16.4 13-26C28 6.8 22.2 1 15 1z" fill="#f97316" stroke="#fff" stroke-width="2"/><circle cx="15" cy="14" r="5.5" fill="#fff"/></svg>' + thumb + "</div>",
        iconSize: [30, 42],
        iconAnchor: [15, 40],
        popupAnchor: [0, -38],
      });
      const marker = Lmod.marker([p.lat, p.lng], { icon });
      (marker as L.Marker & { place?: PlaceSummary }).place = p;
      cluster.addLayer(marker);
      markersRef.current.set(p.id, marker);
    }

    // 首次加载时缩放到覆盖全部地点
    if (!hasFittedRef.current) {
      hasFittedRef.current = true;
      if (ordered.length > 0) {
        map.fitBounds(Lmod.latLngBounds(ordered.map((p) => [p.lat, p.lng] as [number, number])).pad(0.15), {
          maxZoom: 14,
        });
      } else {
        map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      }
    }
  }, [places, ready]);

  // ---------- 悬浮信息窗 (点击标记) ----------
  const openPlacePopup = useCallback((map: L.Map, place: PlaceSummary) => {
    openReactPopup(
      leafletLibRef.current!,
      map,
      [place.lat, place.lng],
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
      { className: "place-popup", maxWidth: 360, minWidth: 320, autoPan: true },
    );
  }, [reloadPlaces]);

  // ---------- 标记组悬浮列表 (单击标记组) ----------
  const openClusterPopup = useCallback((map: L.Map, members: PlaceSummary[]) => {
    if (members.length === 0) return;
    const Lmod = leafletLibRef.current!;
    const bounds = Lmod.latLngBounds(members.map((m) => [m.lat, m.lng] as [number, number]));
    openReactPopup(
      leafletLibRef.current!,
      map,
      bounds.getCenter(),
      (close) => (
        <ClusterList
          places={members}
          onPick={(p) => {
            close();
            map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 15), { duration: 0.5 });
            openPlacePopup(map, p);
          }}
        />
      ),
      { className: "cluster-popup", maxWidth: 320, minWidth: 300, autoPan: true },
    );
  }, [openPlacePopup]);

  // ---------- 定位到当前位置 ----------
  const locate = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    void getCurrentPosition()
      .then((pos) => {
        map.flyTo([pos.lat, pos.lng], Math.max(map.getZoom(), 15), { duration: 0.6 });
        showToast("已定位到当前位置");
      })
      .catch((e) => showToast(e instanceof Error ? e.message : "定位失败, 请检查浏览器权限"));
  }, [showToast]);

  const startAdd = useCallback(() => {
    setDraft(null);
    setAddOpen(true);
  }, []);

  const handleCreated = useCallback((place: PlaceSummary) => {
    setAddOpen(false);
    setDraft(null);
    void reloadPlaces().then(() => {
      const map = mapRef.current;
      if (map) openPlacePopup(map, place);
    });
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

      {addOpen && map && (
        <AddPlaceModal
          map={map}
          leaflet={leafletLibRef.current!}
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