import { memo } from "react";
import { Markdown } from "~/components/markdown/Markdown";
import { extractImages } from "~/lib/markdown";
import { metaDisplay, metaIconOf } from "~/lib/meta";
import type { Note } from "~/lib/types";
import { useBoardStore, screenToWorld } from "~/lib/store";

const NOTE_WIDTH = 240;
const NOTE_HEIGHT = 320;

function ThumbnailStack({ images }: { images: string[] }) {
  if (images.length === 0) return null;
  return (
    <div className="relative h-20 mx-4 mt-4 shrink-0">
      {images.map((src, i) => (
        <img
          key={src + i}
          src={src}
          alt=""
          loading="lazy"
          className="absolute inset-0 w-full h-20 object-cover rounded border border-warm/10 shadow-sm"
          style={{
            transform: `translate(${i * 6}px, ${i * 4}px)`,
            zIndex: i,
          }}
        />
      ))}
    </div>
  );
}

export const NoteCard = memo(function NoteCard({
  note,
  isEditor,
  onClick,
  onMoveCommit,
  onRequestDelete,
}: {
  note: Note;
  isEditor: boolean;
  onClick: (note: Note) => void;
  onMoveCommit: (noteId: string, x: number, y: number) => void;
  onRequestDelete: (note: Note) => void;
}) {
  const dragNote = useBoardStore((s) => s.dragNote);
  const startDragNote = useBoardStore((s) => s.startDragNote);
  const updateDragNote = useBoardStore((s) => s.updateDragNote);
  const endDragNote = useBoardStore((s) => s.endDragNote);

  const handleDelete = (e: React.MouseEvent) => {
    // 确认弹窗由页面级 ConfirmDialog 渲染 (world 层内弹窗会被 transform 缩放)
    e.stopPropagation();
    onRequestDelete(note);
  };

  const isDragging = dragNote?.noteId === note.id;
  // NoteCard 位于已应用 translate+scale 的 world 层内, 直接使用世界坐标定位
  const posX = isDragging ? dragNote.previewX : note.posX;
  const posY = isDragging ? dragNote.previewY : note.posY;

  const images = extractImages(note.content);

  const handleBodyDown = (e: React.PointerEvent) => {
    if (!isEditor) return;
    if (e.button !== 0) return;
    e.stopPropagation();
    // 注意: 不能 preventDefault() — 取消 pointerdown 会抑制后续兼容鼠标事件
    // (click/dblclick), 导致双击无法进入编辑页; 文本选择由 select-none 阻止
    const noteEl = (e.currentTarget as HTMLElement).parentElement as HTMLElement;
    noteEl.setPointerCapture(e.pointerId);
    const vp = useBoardStore.getState().viewport;
    const { wx, wy } = screenToWorld(e.clientX, e.clientY, vp);
    const startX = e.clientX;
    const startY = e.clientY;
    const offsetX = wx - note.posX;
    const offsetY = wy - note.posY;
    // 仅在移动超过阈值后才进入拖拽态 (半透明), 单击不触发拖拽视觉
    let dragging = false;
    const onMove = (ev: PointerEvent) => {
      if (!dragging) {
        const dist = Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY);
        if (dist < 6) return;
        dragging = true;
        startDragNote(note.id, startX, startY, offsetX, offsetY);
      }
      updateDragNote(ev.clientX, ev.clientY);
    };
    const onUp = (_ev: PointerEvent) => {
      if (dragging) {
        const moved = endDragNote();
        if (moved) onMoveCommit(note.id, moved.previewX, moved.previewY);
      }
      // 单击无操作; 双击由根元素 onDoubleClick 进入编辑页
      // pointerup 前捕获已隐式释放, 显式释放需先检查, 否则抛 NotFoundError 中断清理
      if (noteEl.hasPointerCapture(e.pointerId)) {
        noteEl.releasePointerCapture(e.pointerId);
      }
      noteEl.removeEventListener("pointermove", onMove);
      noteEl.removeEventListener("pointerup", onUp);
    };
    noteEl.addEventListener("pointermove", onMove);
    noteEl.addEventListener("pointerup", onUp);
  };

  return (
    <div
      className="absolute select-none"
      draggable={false}
      onDoubleClick={() => onClick(note)}
      style={{
        left: posX,
        top: posY,
        width: NOTE_WIDTH,
        height: NOTE_HEIGHT,
        zIndex: isDragging ? 9999 : note.zIndex,
        opacity: isDragging ? 0.45 : 1,
        touchAction: "none",
      }}
    >
      <div
        className="note-card h-full w-full rounded-lg cursor-pointer flex flex-col"
        onPointerDown={handleBodyDown}
        onDragStart={(e) => e.preventDefault()}
      >
        {isEditor && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleDelete}
            className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-white shadow-md flex items-center justify-center text-red-500 hover:text-red-600 hover:bg-red-50"
            title="删除便笺"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
            </svg>
          </button>
        )}
        {/* 元属性徽章 (Obsidian 式; 只有添加过的属性才显示) */}
        {Object.keys(note.meta).length > 0 && (
          <div className="flex flex-wrap gap-1 px-4 pt-3 shrink-0">
            {Object.entries(note.meta).map(([key, value]) => (
              <span
                key={key}
                className="rounded-full border border-warm/15 bg-white/60 px-1.5 py-0.5 text-[11px] text-warm/70 whitespace-nowrap"
              >
                {metaIconOf(key)} {metaDisplay(key, value)}
              </span>
            ))}
          </div>
        )}
        {images.length > 0 && <ThumbnailStack images={images} />}

        <div className="flex-1 min-h-0 overflow-hidden px-4 pt-3 text-[15px] leading-relaxed break-words">
          <Markdown text={note.content} />
        </div>
      </div>
    </div>
  );
});
