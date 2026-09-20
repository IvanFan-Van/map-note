import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage, jsonApi, postForm } from "~/lib/api";
import type { AMapLib } from "~/lib/amap";
import { wgs84ToGcj02 } from "~/lib/coords";
import { getCurrentPosition, reverseGeocode, searchGeocode } from "~/lib/geocode";
import type { DraftPoint, GeocodeResult, Post } from "~/lib/types";
import { DRAFT_PIN_COLOR, pinHtml } from "./pinIcon";

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
 * 发帖流程:
 * 1. 读取当前 GPS 位置 (失败则退回地图中心手动放置)
 * 2. 逆地理编码 + 附近搜索 → 候选位置列表
 * 3. 未选择候选 → 拖动标记选点
 * 4. 填写标题/正文/可见性 + 选择照片 → 创建帖子并上传照片
 */
export function PostEditorModal({
  map,
  amap,
  initialDraft,
  onCreated,
  onClose,
}: {
  map: AMap.Map;
  amap: AMapLib;
  initialDraft: DraftPoint | null;
  onCreated: (post: Post) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>(initialDraft ? "form" : "locating");
  const [candidates, setCandidates] = useState<GeocodeResult[]>([]);
  const [gpsPos, setGpsPos] = useState<{ lat: number; lng: number } | null>(null);
  const [form, setForm] = useState<DraftPoint & { title: string; content: string; visibility: "public" | "private" }>(
    initialDraft
      ? { ...initialDraft, title: "", content: "", visibility: "public" }
      : { lat: 0, lng: 0, name: "", address: "", title: "", content: "", visibility: "public" },
  );
  const [dragPos, setDragPos] = useState<[number, number] | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [createdPost, setCreatedPost] = useState<Post | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const draftMarkerRef = useRef<AMap.Marker | null>(null);
  const dragStartRef = useRef<[number, number]>([0, 0]);
  const fileRef = useRef<HTMLInputElement>(null);

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
    setForm((f) => ({
      ...f,
      lat: c.lat,
      lng: c.lng,
      name: c.name || c.displayName.slice(0, 40),
      address: c.displayName,
      amapPoiId: c.amapPoiId,
    }));
    map.panTo([c.lng, c.lat]);
    setStep("form");
  };

  const confirmDrag = () => {
    const pos = dragPos ?? [form.lat, form.lng];
    setForm((f) => ({ ...f, lat: pos[0], lng: pos[1], amapPoiId: undefined }));
    setStep("form");
  };

  const pickFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)]);
    if (fileRef.current) fileRef.current.value = "";
  };

  const save = async () => {
    const title = form.title.trim();
    if (!title) {
      setError("请输入标题");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const data = await jsonApi<{ post: Post }>("/api/posts", "POST", {
        title,
        content: form.content.trim(),
        lat: form.lat,
        lng: form.lng,
        placeName: form.name,
        address: form.address,
        amapPoiId: form.amapPoiId,
        visibility: form.visibility,
      });
      setCreatedPost(data.post);
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        await postForm("/api/posts/" + data.post.id + "/media", fd);
      }
      onCreated(data.post);
    } catch (e) {
      setError(
        createdPost
          ? "帖子已创建, 但图片上传失败: " + errorMessage(e, "请稍后在详情页重试")
          : errorMessage(e, "发布失败"),
      );
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="add-modal" onClick={(e) => e.stopPropagation()}>
        {step === "locating" && (
          <div className="modal-body">
            <h3>发帖</h3>
            <p className="modal-hint">正在获取当前位置… (请允许浏览器定位)</p>
          </div>
        )}

        {step === "candidates" && (
          <div className="modal-body">
            <h3>选择帖子定位</h3>
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
            <h3>拖动标记选点</h3>
            <p className="modal-hint">拖动地图上的红色标记到正确位置, 然后确认。</p>
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
            <h3>发布帖子</h3>
            <p className="modal-hint">
              📍 {form.name || "未知地点"} · {form.address || form.lat.toFixed(4) + ", " + form.lng.toFixed(4)}
            </p>
            <label className="pp-field">
              <span>标题 *</span>
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                maxLength={80} placeholder="一句话分享这个地方" autoFocus />
            </label>
            <label className="pp-field">
              <span>正文</span>
              <textarea value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                rows={5} maxLength={10000} placeholder="写下你的体验、攻略或感受…" />
            </label>
            <label className="pp-field">
              <span>照片 (PNG / JPG / WebP / GIF, 单张 ≤5MB)</span>
              <div className="photo-strip">
                {files.map((f, i) => (
                  <span key={i} className="photo-cell">
                    <span className="photo-file-name">{f.name}</span>
                    <button className="photo-del" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}>×</button>
                  </span>
                ))}
                <button className="photo-add" onClick={() => fileRef.current?.click()} disabled={saving}>
                  ＋ 照片
                </button>
              </div>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden
                onChange={(e) => pickFiles(e.target.files)} />
            </label>
            <label className="pp-field">
              <span>可见性</span>
              <select value={form.visibility} onChange={(e) => setForm((f) => ({ ...f, visibility: e.target.value as "public" | "private" }))}>
                <option value="public">公开 (出现在探索地图)</option>
                <option value="private">私密 (仅自己可见)</option>
              </select>
            </label>
            {error && <p className="pp-error">{error}</p>}
            <div className="modal-actions">
              {createdPost ? (
                <>
                  <button className="pp-btn" onClick={onClose}>稍后处理</button>
                  <button className="pp-btn primary" onClick={() => onCreated(createdPost)}>进入帖子</button>
                </>
              ) : (
                <>
                  <button className="pp-btn" onClick={onClose} disabled={saving}>取消</button>
                  <button className="pp-btn primary" onClick={() => void save()} disabled={saving || !form.title.trim()}>
                    {saving ? "发布中…" : "发布"}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
