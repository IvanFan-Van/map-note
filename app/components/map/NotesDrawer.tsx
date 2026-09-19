import { useCallback, useEffect, useState } from "react";
import { errorMessage, jsonApi } from "~/lib/api";
import type { Place, PlaceNote, PlaceSummary } from "~/lib/types";

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
}

/** 笔记组编辑器: 双击标记打开; 支持创建/删除/编辑/排序 */
export function NotesDrawer({
  place,
  onClose,
  onChanged,
}: {
  place: PlaceSummary;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [notes, setNotes] = useState<PlaceNote[] | null>(null);
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await jsonApi<{ place: Place }>("/api/places/" + place.id, "GET");
      setNotes(data.place.notes ?? []);
      setError(null);
    } catch (e) {
      setError(errorMessage(e, "加载失败"));
    }
  }, [place.id]);

  useEffect(() => { void load(); }, [load]);

  const refresh = async () => {
    await load();
    onChanged();
  };

  const addNote = async () => {
    const content = text.trim();
    if (!content || busy) return;
    setBusy(true);
    setError(null);
    try {
      await jsonApi("/api/places/" + place.id + "/notes", "POST", { content });
      setText("");
      await refresh();
    } catch (e) {
      setError(errorMessage(e, "添加失败"));
    } finally {
      setBusy(false);
    }
  };

  const removeNote = async (id: string) => {
    if (!window.confirm("确定删除这条笔记吗?")) return;
    try {
      await jsonApi("/api/places/" + place.id + "/notes/" + id, "DELETE");
      await refresh();
    } catch (e) {
      setError(errorMessage(e, "删除失败"));
    }
  };

  const saveEdit = async (id: string) => {
    const content = editText.trim();
    if (!content) return;
    try {
      await jsonApi("/api/places/" + place.id + "/notes/" + id, "PATCH", { content });
      setEditingId(null);
      await refresh();
    } catch (e) {
      setError(errorMessage(e, "保存失败"));
    }
  };

  const move = async (id: string, dir: -1 | 1) => {
    if (!notes) return;
    const idx = notes.findIndex((n) => n.id === id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= notes.length) return;
    try {
      await jsonApi("/api/places/" + place.id + "/notes/" + id, "PATCH", { position: target });
      await refresh();
    } catch (e) {
      setError(errorMessage(e, "排序失败"));
    }
  };

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="notes-drawer" onClick={(e) => e.stopPropagation()}>
        <header className="drawer-header">
          <div>
            <h2>📝 笔记组</h2>
            <p className="drawer-sub">{place.name}</p>
          </div>
          <button className="pp-close" onClick={onClose}>×</button>
        </header>

        <div className="drawer-add">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2}
            placeholder="记录一下这个地方…" maxLength={5000}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void addNote(); }} />
          <button className="pp-btn primary" onClick={() => void addNote()} disabled={busy || !text.trim()}>
            {busy ? "添加中…" : "添加笔记"}
          </button>
        </div>

        {error && <p className="pp-error">{error}</p>}

        <ul className="drawer-notes">
          {notes === null ? (
            <li className="drawer-empty">加载中…</li>
          ) : notes.length === 0 ? (
            <li className="drawer-empty">还没有笔记 — 双击标记即可添加</li>
          ) : (
            notes.map((n, i) => (
              <li key={n.id} className="note-item">
                {editingId === n.id ? (
                  <div className="note-edit">
                    <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={3} maxLength={5000} autoFocus />
                    <div className="note-edit-actions">
                      <button className="pp-btn" onClick={() => setEditingId(null)}>取消</button>
                      <button className="pp-btn primary" onClick={() => void saveEdit(n.id)}>保存</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="note-content">{n.content}</p>
                    <div className="note-meta">
                      <span className="note-time">{formatTime(n.createdAt)}</span>
                      <div className="note-actions">
                        <button title="上移" onClick={() => void move(n.id, -1)} disabled={i === 0}>↑</button>
                        <button title="下移" onClick={() => void move(n.id, 1)} disabled={i === notes.length - 1}>↓</button>
                        <button title="编辑" onClick={() => { setEditingId(n.id); setEditText(n.content); }}>✎</button>
                        <button title="删除" onClick={() => void removeNote(n.id)}>🗑</button>
                      </div>
                    </div>
                  </>
                )}
              </li>
            ))
          )}
        </ul>
      </aside>
    </div>
  );
}
