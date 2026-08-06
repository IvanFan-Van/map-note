import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Markdown } from "~/components/markdown/Markdown";
import { useCanvasStore } from "~/lib/canvas";
import { useDragItem } from "~/lib/useDrag";
import { useBlockStore } from "~/lib/blockStore";
import type { AlignH, AlignV, Block } from "~/lib/types";

export interface TextBlockHandle {
  insertImageAtCursor: (url: string) => void;
}

const ALIGN_H_MAP: Record<AlignH, "flex-start" | "center" | "flex-end"> = {
  left: "flex-start",
  center: "center",
  right: "flex-end",
};
const ALIGN_V_MAP: Record<AlignV, "flex-start" | "center" | "flex-end"> = {
  top: "flex-start",
  middle: "center",
  bottom: "flex-end",
};

export const TextBlock = memo(
  function TextBlock({
    block,
    isEditor,
    selected,
    editing,
    onSelect,
    onStartEdit,
    onCommitText,
    onCommitMove,
    onCommitAlign,
    onDelete,
    onUploadImage,
    onOpenSticker,
    ref,
  }: {
    block: Block;
    isEditor: boolean;
    selected: boolean;
    editing: boolean;
    onSelect: () => void;
    onStartEdit: () => void;
    onCommitText: (id: string, text: string) => void;
    onCommitMove: (id: string, x: number, y: number) => void;
    onCommitAlign: (id: string, h: AlignH, v: AlignV) => void;
    onDelete: (id: string) => void;
    onUploadImage: (file: File) => Promise<string>;
    onOpenSticker: () => void;
    ref: React.Ref<TextBlockHandle>;
  }) {
    const dragBlock = useBlockStore((s) => s.dragBlock);
    const startDragBlock = useBlockStore((s) => s.startDragBlock);
    const updateDragBlock = useBlockStore((s) => s.updateDragBlock);
    const endDragBlock = useBlockStore((s) => s.endDragBlock);

    const getViewport = useCallback(() => useCanvasStore.getState().viewport, []);
    const { handlePointerDown, isDragging } = useDragItem(
      block.id,
      block.posX,
      block.posY,
      isEditor && !editing,
      getViewport,
      {
        beginDrag: startDragBlock,
        dragTo: (_id, x, y) => updateDragBlock(x, y),
        endDrag: endDragBlock,
        isDragging: (id) => dragBlock?.blockId === id,
      },
      onCommitMove,
    );

    const posX = isDragging ? dragBlock!.previewX : block.posX;
    const posY = isDragging ? dragBlock!.previewY : block.posY;

    // 编辑态草稿 (受控); 显示态直接渲染 block.text
    const [draft, setDraft] = useState(block.text);
    const taRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
      if (editing) setDraft(block.text);
    }, [editing, block.text]);

    // 编辑态宽高自适应: 不自动换行, 宽度随内容横向拓展 (Enter 才换行)
    const fitTextarea = useCallback(() => {
      const ta = taRef.current;
      if (!ta) return;
      ta.style.width = "auto";
      ta.style.width = `${Math.max(block.width, ta.scrollWidth + 4)}px`;
      ta.style.height = "auto";
      ta.style.height = `${ta.scrollHeight + 2}px`;
    }, [block.width]);

    useEffect(() => {
      if (editing) {
        fitTextarea();
        taRef.current?.focus();
      }
    }, [editing, fitTextarea, draft]);

    const commit = useCallback(() => {
      const text = draft.replace(/\n{3,}/g, "\n\n");
      onCommitText(block.id, text);
    }, [draft, onCommitText, block.id]);

    const insertImageAtCursor = useCallback(
      (url: string) => {
        const ta = taRef.current;
        setDraft((prev) => {
          if (ta && document.activeElement === ta) {
            const start = ta.selectionStart ?? prev.length;
            const end = ta.selectionEnd ?? start;
            const md = `![](${url})`;
            const next = prev.slice(0, start) + md + prev.slice(end);
            requestAnimationFrame(() => {
              const pos = start + md.length;
              ta.setSelectionRange(pos, pos);
              fitTextarea();
            });
            return next;
          }
          return `${prev}\n![](${url})`;
        });
      },
      [fitTextarea],
    );

    useImperativeHandle(ref, () => ({ insertImageAtCursor }), [insertImageAtCursor]);

    // 粘贴图片 → 上传 → 光标处插入 markdown 图片
    const handlePaste = useCallback(
      (e: React.ClipboardEvent) => {
        const files = Array.from(e.clipboardData?.files ?? []);
        const img = files.find((f) => f.type.startsWith("image/"));
        if (!img) return;
        e.preventDefault();
        void onUploadImage(img).then((url) => insertImageAtCursor(url));
      },
      [onUploadImage, insertImageAtCursor],
    );

    const borderCls = selected
      ? "border-blue-400 ring-1 ring-blue-300"
      : editing
        ? "border-warm/30"
        : "border-transparent hover:border-warm/20";

    return (
      <div
        className="absolute select-none"
        data-block
        onPointerDown={(e) => {
          // 编辑态: 阻止冒泡到画布 (否则 textarea 内点击会触发画布平移)
          if (editing) e.stopPropagation();
        }}
        style={{ left: posX, top: posY, zIndex: isDragging ? 9999 : block.zIndex }}
      >
        <div
          onPointerDown={handlePointerDown}
          onClick={onSelect}
          onDoubleClick={onStartEdit}
          className={`min-h-8 rounded-lg border px-2 py-1 cursor-text transition-colors ${borderCls} ${
            isDragging ? "opacity-45" : ""
          }`}
        >
          {editing && isEditor ? (
            <textarea
              ref={taRef}
              value={draft}
              wrap="off"
              maxLength={5000}
              onChange={(e) => setDraft(e.target.value)}
              onInput={fitTextarea}
              onBlur={commit}
              onPaste={handlePaste}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setDraft(block.text);
                  onCommitText(block.id, block.text);
                }
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  taRef.current?.blur();
                }
              }}
              className="block w-full resize-none bg-transparent outline-none whitespace-pre leading-relaxed"
              style={{ minWidth: block.width }}
            />
          ) : (
            <div
              className="flex"
              style={{
                minWidth: block.width,
                width: "fit-content",
                justifyContent: ALIGN_H_MAP[block.alignH],
                alignItems: ALIGN_V_MAP[block.alignV],
              }}
            >
              {block.text.trim() ? (
                <div className="whitespace-pre leading-relaxed">
                  <Markdown text={block.text} />
                </div>
              ) : (
                <span className="text-warm/30">空文本块</span>
              )}
            </div>
          )}
        </div>

        {/* 选中工具栏: 对齐 (上中下 / 左中右) + 表情 + 删除 */}
        {selected && isEditor && !editing && (
          <div
            className="absolute -top-10 left-0 flex items-center gap-1 rounded-xl bg-warm text-white px-1.5 py-1 shadow-lg whitespace-nowrap"
            style={{ fontFamily: "'LeMiXiaoNaiPaoTi', var(--font-sans)" }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {(["left", "center", "right"] as AlignH[]).map((h) => (
              <button
                key={h}
                onClick={() => onCommitAlign(block.id, h, block.alignV)}
                className={`w-6 h-6 rounded text-xs flex items-center justify-center ${
                  block.alignH === h ? "bg-blue-500" : "hover:bg-white/15"
                }`}
                title={h === "left" ? "左对齐" : h === "center" ? "水平居中" : "右对齐"}
              >
                {h === "left" ? "左" : h === "center" ? "中" : "右"}
              </button>
            ))}
            <span className="w-px h-4 bg-white/25 mx-0.5" />
            {(["top", "middle", "bottom"] as AlignV[]).map((v) => (
              <button
                key={v}
                onClick={() => onCommitAlign(block.id, block.alignH, v)}
                className={`w-6 h-6 rounded text-xs flex items-center justify-center ${
                  block.alignV === v ? "bg-blue-500" : "hover:bg-white/15"
                }`}
                title={v === "top" ? "上对齐" : v === "middle" ? "垂直居中" : "下对齐"}
              >
                {v === "top" ? "上" : v === "middle" ? "中" : "下"}
              </button>
            ))}
            <span className="w-px h-4 bg-white/25 mx-0.5" />
            <button
              onClick={onOpenSticker}
              className="w-6 h-6 rounded text-xs hover:bg-white/15 flex items-center justify-center"
              title="插入表情"
            >
              😀
            </button>
            <button
              onClick={() => onDelete(block.id)}
              className="w-6 h-6 rounded text-xs hover:bg-red-500/80 flex items-center justify-center"
              title="删除文本块"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    );
  },
);
