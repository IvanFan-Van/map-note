import { useCallback, useEffect, useRef, useState } from "react";
import { jsonApi } from "~/lib/api";
import type { StickerItem } from "~/routes/api/stickers";

// ---------- GIPHY 表情搜索弹层 (搜索防抖 / 滚动加载 / 转存 R2) ----------

export function StickerPicker({
  boardId,
  onPick,
  onClose,
}: {
  boardId: string;
  onPick: (r2Url: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<StickerItem[]>([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (query: string, start: number, replace: boolean) => {
    setLoading(true);
    try {
      const res = await jsonApi<{ items: StickerItem[] }>(
        `/api/stickers?q=${encodeURIComponent(query)}&offset=${start}`,
        "GET",
      );
      setItems((prev) =>
        replace ? (res.items ?? []) : [...prev, ...(res.items ?? [])],
      );
      setOffset(start + (res.items?.length ?? 0));
    } catch {
      // 静默失败, 保持现有内容
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load("", 0, true);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [load]);

  const handleSearch = (v: string) => {
    setQ(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void load(v, 0, true), 300);
  };

  const handleScroll = () => {
    const el = listRef.current;
    if (!el || loading) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 120) {
      void load(q, offset, false);
    }
  };

  const handlePick = (fullUrl: string) => {
    if (importing) return;
    setImporting(true);
    // 转存到 R2 (GIPHY 外链有有效期), 成功后用稳定 URL 插入
    void jsonApi<{ url: string }>("/api/stickers", "POST", {
      url: fullUrl,
      boardId,
    })
      .then((r) => onPick(r.url))
      .catch(() => undefined)
      .finally(() => setImporting(false));
  };

  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center bg-black/25"
      onClick={onClose}
    >
      <div
        className="flex h-[70vh] max-h-[520px] w-[440px] max-w-[92vw] flex-col rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 p-3 border-b border-warm/10">
          <input
            value={q}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="搜索表情 (如 crying cat / 哭哭)"
            autoFocus
            className="flex-1 rounded-xl bg-board/60 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300"
          />
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1.5 text-warm/60 hover:bg-board/60"
            title="关闭"
          >
            ✕
          </button>
        </div>
        <div
          ref={listRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto grid grid-cols-3 gap-2 p-3 content-start"
        >
          {items.map((it) => (
            <button
              key={it.id}
              onClick={() => handlePick(it.full)}
              disabled={importing}
              className="aspect-square rounded-xl overflow-hidden bg-board/40 hover:ring-2 hover:ring-blue-400 disabled:opacity-50 transition-all"
              title="点击插入"
            >
              <img src={it.preview} alt="" className="w-full h-full object-cover" loading="lazy" />
            </button>
          ))}
          {loading && (
            <div className="col-span-3 text-center text-sm text-warm/50 py-4">
              加载中…
            </div>
          )}
          {!loading && items.length === 0 && (
            <div className="col-span-3 text-center text-sm text-warm/50 py-8">
              没有找到相关表情, 换个关键词试试
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
