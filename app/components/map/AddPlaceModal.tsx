import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage, jsonApi } from "~/lib/api";
import type { AMapLib } from "~/lib/amap";
import { wgs84ToGcj02 } from "~/lib/coords";
import { getCurrentPosition, reverseGeocode, searchGeocode } from "~/lib/geocode";
import { DEFAULT_PLACE_DESCRIPTION } from "~/lib/types";
import type { GeocodeResult, PlaceSummary } from "~/lib/types";
import { pinHtml, DRAFT_PIN_COLOR } from "./pinIcon";

export interface DraftPoint {
  lat: number;
  lng: number;
  name: string;
  address: string;
}

type Step = "locating" | "candidates" | "drag" | "form";

function dedupeByCoords(results: GeocodeResult[]): GeocodeResult[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    const key = r.lat.toFixed(5) + "," + r.lng.toFixed(5);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * 添加地点流程:
 * 1. 读取当前 GPS 位置 (失败则退回地图中心手动放置)
 * 2. 逆地理编码 + 附近搜索 → 弹出"选择具体位置"候选列表
 * 3. 未选择候选 → 允许拖动标记到任意位置, 自行填写名称/描述
 * 坐标统一为 GCJ-02 (高德坐标, 与后端存储一致)
 */
export function AddPlaceModal({
  map,
  amap,
  initialDraft,
  onCreated,
  onClose,
}: {
  map: AMap.Map;
  amap: AMapLib;
  initialDraft: DraftPoint | null;
  onCreated: (place: PlaceSummary) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>(initialDraft ? "form" : "locating");
  const [candidates, setCandidates] = useState<GeocodeResult[]>([]);
  const [gpsPos, setGpsPos] = useState<{ lat: number; lng: number } | null>(null);
  const [form, setForm] = useState<{ lat: number; lng: number; name: string; address: string; description: string }>(
    initialDraft
      ? { ...initialDraft, description: DEFAULT_PLACE_DESCRIPTION }
      : { lat: 0, lng: 0, name: "", address: "", description: DEFAULT_PLACE_DESCRIPTION },
  );
  const [dragPos, setDragPos] = useState<[number, number] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const draftMarkerRef = useRef<AMap.Marker | null>(null);
  const dragStartRef = useRef<[number, number]>([0, 0]);

  const startDrag = useCallback((pos: [number, number]) => {
    dragStartRef.current = pos;
    setDragPos(pos);
    setForm((f) => ({ ...f, lat: pos[0], lng: pos[1] }));
    setStep("drag");
  }, []);

  // 挂载时开始定位 (无 initialDraft 时)
  useEffect(() => {
    if (initialDraft) return;
    let cancelled = false;
    (async () => {
      let pos: { lat: number; lng: number } | null = null;
      try {
        const gps = await getCurrentPosition();
        pos = wgs84ToGcj02(gps.lat, gps.lng);
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
          const nearby = dedupeByCoords(await searchGeocode(rev.displayName, pos, 6));
          if (nearby.length > 0) results = nearby;
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
  }, [initialDraft, map, startDrag]);

  // 拖动步骤: 创建可拖动草稿标记
  useEffect(() => {
    if (step !== "drag") {
      draftMarkerRef.current?.setMap(null);
      draftMarkerRef.current = null;
      return;
    }
    const start = dragStartRef.current;
    const marker = new amap.Marker({
      position: [start[1], start[0]],
      content: pinHtml(DRAFT_PIN_COLOR, { wrapperClass: "draft-pin-wrap" }),
      anchor: "bottom-center",
      draggable: true,
      zIndex: 100,
    });
    marker.setMap(map);
    marker.on("dragend", () => {
      const p = marker.getPosition();
      if (p) setDragPos([p.lat, p.lng]);
    });
    map.panTo([start[1], start[0]]);
    draftMarkerRef.current = marker;
    return () => {
      marker.setMap(null);
      draftMarkerRef.current = null;
    };
  }, [step, amap, map]);

  const useCandidate = (c: GeocodeResult) => {
    setForm({
      lat: c.lat,
      lng: c.lng,
      name: c.name || c.displayName.slice(0, 40),
      address: c.displayName,
      description: DEFAULT_PLACE_DESCRIPTION,
    });
    map.panTo([c.lng, c.lat]);
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
        description: form.description.trim() || DEFAULT_PLACE_DESCRIPTION,
        lat: form.lat,
        lng: form.lng,
      });
      onCreated(data.place);
    } catch (e) {
      setError(errorMessage(e, "保存失败"));
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
