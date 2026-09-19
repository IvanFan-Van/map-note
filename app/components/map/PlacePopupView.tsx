import { useRef, useState } from "react";
import { errorMessage, jsonApi, postForm } from "~/lib/api";
import { DEFAULT_PLACE_DESCRIPTION, PRESET_META_LABELS } from "~/lib/types";
import type { MetaItem, PhotoItem, PlaceSummary } from "~/lib/types";

function Stars({ score }: { score: number }) {
  return (
    <span className="stars" aria-label={score + " 分"}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= score ? "star on" : "star"}>{i <= score ? "★" : "☆"}</span>
      ))}
    </span>
  );
}

/** 悬浮信息窗: 点击标记弹出; 双击窗口进入编辑 */
export function PlacePopupView({
  place,
  onChanged,
  onClose,
  onEditNotes,
}: {
  place: PlaceSummary;
  onChanged: () => void;
  onClose: () => void;
  onEditNotes: () => void;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <PlaceEditForm
        place={place}
        onSaved={() => {
          setEditing(false);
          onChanged();
        }}
        onCancel={() => setEditing(false)}
        onDeleted={onClose}
      />
    );
  }
  const notes = place.notes ?? [];
  return (
    <div className="place-popup-view" onDoubleClick={() => setEditing(true)}>
      <div className="pp-header">
        <h3 className="pp-name">{place.name}</h3>
        <button className="pp-close" onClick={onClose} title="关闭">×</button>
      </div>
      <p className="pp-address">📍 {place.address || "未知地址"}</p>
      <p className="pp-desc">{place.description || DEFAULT_PLACE_DESCRIPTION}</p>
      {place.photos.length > 0 && (
        <div className="photo-strip">
          {place.photos.map((p) => (
            <img key={p.key} src={p.url} alt="" className="photo-thumb" loading="lazy" />
          ))}
        </div>
      )}
      {place.metas.length > 0 && (
        <div className="pp-metas">
          {place.metas.map((m) => (
            <span key={m.id} className="meta-chip">
              {m.label} <Stars score={m.score} /> {m.score}
            </span>
          ))}
        </div>
      )}
      {notes.length > 0 && (
        <div className="pp-notes">
          {notes.slice(0, 3).map((n) => (
            <p key={n.id} className="pp-note-line">📝 {n.content}</p>
          ))}
          {notes.length > 3 && <p className="pp-more">… 共 {notes.length} 条笔记</p>}
        </div>
      )}
      <div className="pp-footer">
        <button className="pp-btn" onClick={() => setEditing(true)}>✏️ 编辑</button>
        <button className="pp-btn" onClick={onEditNotes}>📝 笔记组</button>
        <span className="pp-hint">双击窗口编辑 · 双击标记编辑笔记</span>
      </div>
    </div>
  );
}

async function uploadPhoto(placeId: string, file: File): Promise<PhotoItem> {
  const fd = new FormData();
  fd.append("placeId", placeId);
  fd.append("file", file);
  const data = await postForm<{ image?: PhotoItem }>("/api/images", fd);
  if (!data.image) throw new Error("上传失败");
  return data.image;
}

/** 编辑模式: 双击信息窗进入; 支持名称/地址/描述/照片组/元信息 */
function PlaceEditForm({
  place,
  onSaved,
  onCancel,
  onDeleted,
}: {
  place: PlaceSummary;
  onSaved: () => void;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(place.name);
  const [address, setAddress] = useState(place.address);
  const [description, setDescription] = useState(place.description || DEFAULT_PLACE_DESCRIPTION);
  const [photos, setPhotos] = useState<PhotoItem[]>(place.photos);
  const [metas, setMetas] = useState<MetaItem[]>(place.metas);
  const [customLabel, setCustomLabel] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const addMeta = (label: string, custom: boolean) => {
    if (metas.some((m) => m.label === label)) return;
    setMetas((prev) => [
      ...prev,
      { id: crypto.randomUUID(), label, score: 3, custom },
    ]);
  };

  const addCustomMeta = () => {
    const label = customLabel.trim();
    if (!label) return;
    addMeta(label, true);
    setCustomLabel("");
  };

  const setScore = (id: string, score: number) => {
    setMetas((prev) => prev.map((m) => (m.id === id ? { ...m, score } : m)));
  };

  const removeMeta = (id: string) => {
    setMetas((prev) => prev.filter((m) => m.id !== id));
  };

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const item = await uploadPhoto(place.id, file);
        setPhotos((prev) => [...prev, item]);
      }
    } catch (e) {
      setError(errorMessage(e, "上传失败"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("请输入地点名称");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await jsonApi("/api/places/" + place.id, "PATCH", {
        name: trimmed,
        address: address.trim(),
        description: description.trim() || DEFAULT_PLACE_DESCRIPTION,
        photos,
        metas,
      });
      onSaved();
    } catch (e) {
      setError(errorMessage(e, "保存失败"));
      setSaving(false);
    }
  };

  const removePlace = async () => {
    if (!window.confirm("确定删除该地点吗? 其笔记与照片引用将一并移除。")) return;
    setSaving(true);
    try {
      await jsonApi("/api/places/" + place.id, "DELETE");
      onDeleted();
    } catch (e) {
      setError(errorMessage(e, "删除失败"));
      setSaving(false);
    }
  };

  const missingPresets = PRESET_META_LABELS.filter((p) => !metas.some((m) => m.label === p));

  return (
    <div className="place-popup-edit">
      <div className="pp-header">
        <h3 className="pp-name">编辑地点</h3>
        <button className="pp-close" onClick={onCancel} title="取消">×</button>
      </div>
      <label className="pp-field">
        <span>名称</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="例如: xx猫咖" />
      </label>
      <label className="pp-field">
        <span>地址</span>
        <input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} placeholder="例如: 西湖区xx街道xx号" />
      </label>
      <label className="pp-field">
        <span>描述</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={3} />
      </label>

      <div className="pp-field">
        <span>照片组</span>
        <div className="photo-strip">
          {photos.map((p) => (
            <div key={p.key} className="photo-cell">
              <img src={p.url} alt="" className="photo-thumb" />
              <button className="photo-del" onClick={() => setPhotos((prev) => prev.filter((x) => x.key !== p.key))}>×</button>
            </div>
          ))}
          <button className="photo-add" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? "上传中…" : "+ 照片"}
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden
          onChange={(e) => void onFiles(e.target.files)} />
      </div>

      <div className="pp-field">
        <span>元信息 (1-5 分)</span>
        {metas.length === 0 && <p className="pp-empty-hint">暂无元信息, 点击下方预设或自定义添加</p>}
        <div className="meta-editor">
          {metas.map((m) => (
            <div key={m.id} className="meta-row">
              <span className="meta-label">{m.label}</span>
              <span className="meta-stars">
                {[1, 2, 3, 4, 5].map((i) => (
                  <button key={i} type="button" className={i <= m.score ? "star on" : "star"}
                    onClick={() => setScore(m.id, i)}>{i <= m.score ? "★" : "☆"}</button>
                ))}
              </span>
              <button type="button" className="meta-del" onClick={() => removeMeta(m.id)}>×</button>
            </div>
          ))}
        </div>
        <div className="meta-add">
          {missingPresets.map((p) => (
            <button key={p} type="button" className="pp-chip" onClick={() => addMeta(p, false)}>＋{p}</button>
          ))}
          <input value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} maxLength={20}
            placeholder="自定义元信息名" className="meta-custom-input"
            onKeyDown={(e) => {
              if (e.key === "Enter") addCustomMeta();
            }} />
          <button type="button" className="pp-chip" onClick={addCustomMeta}>＋添加</button>
        </div>
      </div>

      {error && <p className="pp-error">{error}</p>}
      <div className="pp-actions">
        <button className="pp-btn danger" onClick={() => void removePlace()} disabled={saving}>删除标记</button>
        <span className="pp-spacer" />
        <button className="pp-btn" onClick={onCancel} disabled={saving}>取消</button>
        <button className="pp-btn primary" onClick={() => void save()} disabled={saving}>
          {saving ? "保存中…" : "保存"}
        </button>
      </div>
    </div>
  );
}

export type { PhotoItem, MetaItem };