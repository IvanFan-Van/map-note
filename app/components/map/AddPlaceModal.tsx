import { useEffect, useRef, useState } from "react";
import type * as L from "leaflet";
import type { LeafletLib } from "./reactPopup";
import { jsonApi } from "~/lib/api";
import { getCurrentPosition, reverseGeocode, searchGeocode } from "~/lib/geocode";
import type { GeocodeResult, PlaceSummary } from "~/lib/types";

const DEFAULT_DESCRIPTION = "还未有任何描述";

export interface DraftPoint {
  lat: number;
  lng: number;
  name: string;
  address: string;
}

type Step = "locating" | "candidates" | "drag" | "form";

/**
 * 添加地点流程:
 * 1. 读取当前 GPS 位置 (失败则退回地图中心手动放置)
 * 2. 逆地理编码 + 附近搜索 → 弹出"选择具体位置"候选列表
 * 3. 未选择候选 → 允许拖动标记到任意位置, 自行填写名称/描述
 */
export function AddPlaceModal({
  map,
  leaflet,
  initialDraft,
  onCreated,
  onClose,
}: {
  map: L.Map;
  leaflet: LeafletLib;
  initialDraft: DraftPoint | null;
  onCreated: (place: PlaceSummary) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>(initialDraft ? "form" : "locating");
  const [candidates, setCandidates] = useState<GeocodeResult[]>([]);
  const [gpsPos, setGpsPos] = useState<{ lat: number; lng: number } | null>(null);
  const [form, setForm] = useState<{ lat: number; lng: number; name: string; address: string; description: string }>(
    initialDraft
      ? { ...initialDraft, description: DEFAULT_DESCRIPTION }
      : { lat: 0, lng: 0, name: "", address: "", description: DEFAULT_DESCRIPTION },
  );
  const [dragPos, setDragPos] = useState<[number, number] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const draftMarkerRef = useRef<L.Marker | null>(null);

  // 挂载时开始定位 (无 initialDraft 时)
  useEffect(() => {
    if (initialDraft) return;
    let cancelled = false;
    (async () => {
      let pos: { lat: number; lng: number } | null = null;
      try {
        pos = await getCurrentPosition();
      } catch {
        // 定位失败时回退到手动拖动
      }
      if (cancelled) return;
      if (!pos) {
        const c = map.getCenter();
        startDrag([c.lat, c.lng]);
        return;
      }
      setGpsPos(pos);
      let results: GeocodeResult[] = [];
      try {
        const rev = await reverseGeocode(pos.lat, pos.lng);
        if (rev) {
          results = [rev];
          const nearby = await searchGeocode(rev.displayName, pos, 6);
          const seen = new Set<string>();
          results = nearby.filter((r) => {
            const k = r.lat.toFixed(5) + "," + r.lng.toFixed(5);
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          });
          if (results.length === 0) results = [rev];
        }
      } catch {
        // 地理编码失败时允许直接手动放置
      }
      if (cancelled) return;
      if (results.length === 0) {
        startDrag([pos.lat, pos.lng]);
      } else {
        setCandidates(results);
        setStep("candidates");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 拖动步骤: 创建可拖动草稿标记
  useEffect(() => {
    if (step !== "drag") {
      draftMarkerRef.current?.remove();
      draftMarkerRef.current = null;
      return;
    }
    const start: [number, number] = dragPos ?? [form.lat || 0, form.lng || 0];
    const icon = leaflet.divIcon({
      className: "draft-pin-wrap",
      html: '<div class="draft-pin"><svg viewBox="0 0 30 42" width="30" height="42"><path d="M15 1C7.8 1 2 6.8 2 14c0 9.6 13 26 13 26s13-16.4 13-26C28 6.8 22.2 1 15 1z" fill="#e11d48" stroke="#fff" stroke-width="2"/><circle cx="15" cy="14" r="5.5" fill="#fff"/></svg></div>',
      iconSize: [30, 42],
      iconAnchor: [15, 40],
    });
    const marker = leaflet.marker(start, { icon, draggable: true }).addTo(map);
    marker.on("dragend", () => {
      const p = marker.getLatLng();
      setDragPos([p.lat, p.lng]);
    });
    map.panTo(start);
    draftMarkerRef.current = marker;
    return () => {
      marker.remove();
      draftMarkerRef.current = null;
    };
  }, [step]);

  const startDrag = (pos: [number, number]) => {
    setDragPos(pos);
    setForm((f) => ({ ...f, lat: pos[0], lng: pos[1] }));
    setStep("drag");
  };

  const useCandidate = (c: GeocodeResult) => {
    setForm({
      lat: c.lat,
      lng: c.lng,
      name: c.name || c.displayName.slice(0, 40),
      address: c.displayName,
      description: DEFAULT_DESCRIPTION,
    });
    map.panTo([c.lat, c.lng]);
    setStep("form");
  };

  const confirmDrag = () => {
    const pos = dragPos ?? [form.lat, form.lng];
    setForm((f) => ({ ...f, lat: pos[0], lng: pos[1] }));
    setStep("form");
  };

  const save = async () => {
    const name = form.name.trim();
    if (!name) {
      setError("请输入地点名称");
      return;
    }
    if (!Number.isFinite(form.lat) || !Number.isFinite(form.lng)) {
      setError("请先确定位置");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const data = await jsonApi<{ place: PlaceSummary }>("/api/places", "POST", {
        name,
        address: form.address.trim().slice(0, 200),
        description: form.description.trim() || DEFAULT_DESCRIPTION,
        lat: form.lat,
        lng: form.lng,
      });
      onCreated(data.place);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="add-modal" onClick={(e) => e.stopPropagation()}>
        {step === "locating" && (
          <div className="modal-body">
            <h3>添加地点</h3>
            <p className="modal-hint">正在获取当前位置… (请允许浏览器定位)</p>
          </div>
        )}

        {step === "candidates" && (
          <div className="modal-body">
            <h3>选择具体位置</h3>
            <p className="modal-hint">找到以下候选地点, 请选择你要标记的位置:</p>
            <ul className="candidate-list">
              {candidates.map((c, i) => (
                <li key={i}>
                  <button className="candidate-item" onClick={() => useCandidate(c)}>
                    <span className="candidate-name">{c.name || "未知地点"}</span>
                    <span className="candidate-addr">{c.displayName}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button className="pp-btn full" onClick={() => startDrag([gpsPos?.lat ?? 0, gpsPos?.lng ?? 0])}>
              不使用候选项, 手动拖动标记
            </button>
          </div>
        )}

        {step === "drag" && (
          <div className="modal-body">
            <h3>拖动标记</h3>
            <p className="modal-hint">拖动地图上的红色标记到正确位置, 然后确认。未选择任何候选位置, 可任意放置。</p>
            <p className="drag-coords">
              当前: {dragPos ? dragPos[0].toFixed(5) + ", " + dragPos[1].toFixed(5) : "拖动中…"}
            </p>
            <div className="modal-actions">
              <button className="pp-btn" onClick={onClose}>取消</button>
              <button className="pp-btn primary" onClick={confirmDrag}>确认位置</button>
            </div>
          </div>
        )}

        {step === "form" && (
          <div className="modal-body">
            <h3>保存地点</h3>
            <label className="pp-field">
              <span>名称 *</span>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                maxLength={60} placeholder="例如: xx猫咖 / xx餐厅" autoFocus />
            </label>
            <label className="pp-field">
              <span>地址</span>
              <input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                maxLength={200} placeholder="例如: 西湖区xx街道xx号" />
            </label>
            <label className="pp-field">
              <span>描述</span>
              <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={3} maxLength={2000} />
            </label>
            {error && <p className="pp-error">{error}</p>}
            <div className="modal-actions">
              <button className="pp-btn" onClick={onClose} disabled={saving}>取消</button>
              <button className="pp-btn primary" onClick={() => void save()} disabled={saving}>
                {saving ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}