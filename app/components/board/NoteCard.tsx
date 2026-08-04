import { memo } from "react";
import { Markdown } from "~/components/markdown/Markdown";
import { extractImages } from "~/lib/markdown";
import type { Note } from "~/lib/types";
import { useBoardStore } from "~/lib/store";

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
}: {
  note: Note;
  isEditor: boolean;
  onClick: (note: Note) => void;
  onMoveCommit: (noteId: string, x: number, y: number) => void;
}) {
  const dragNote = useBoardStore((s) => s.dragNote);
  const startDragNote = useBoardStore((s) => s.startDragNote);
  const updateDragNote = useBoardStore((s) => s.updateDragNote);
  const endDragNote = useBoardStore((s) => s.endDragNote);

  const isDragging = dragNote?.noteId === note.id;
  // NoteCard 位于已应用 translate+scale 的 world 层内, 直接使用世界坐标定位
  const posX = isDragging ? dragNote.previewX : note.posX;
  const posY = isDragging ? dragNote.previewY : note.posY;

  const images = extractImages(note.content);

  const handleBodyDown = (e: React.PointerEvent) => {
    if (!isEditor) return;
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const noteEl = (e.currentTarget as HTMLElement).parentElement as HTMLElement;
    noteEl.setPointerCapture(e.pointerId);
    const vp = useBoardStore.getState().viewport;
    const wx = (e.clientX - vp.viewX) / vp.scale;
    const wy = (e.clientY - vp.viewY) / vp.scale;
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
    const onUp = (ev: PointerEvent) => {
      if (dragging) {
        const moved = endDragNote();
        if (moved) onMoveCommit(note.id, moved.previewX, moved.previewY);
      }
      // 单击无操作; 双击由 onDoubleClick 进入编辑页
      noteEl.releasePointerCapture(e.pointerId);
      noteEl.removeEventListener("pointermove", onMove);
      noteEl.removeEventListener("pointerup", onUp);
    };
    noteEl.addEventListener("pointermove", onMove);
    noteEl.addEventListener("pointerup", onUp);
  };

  return (
    <div
      className="absolute select-none"
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
        onDoubleClick={() => onClick(note)}
      >
        {images.length > 0 && <ThumbnailStack images={images} />}

        <div className="flex-1 min-h-0 overflow-hidden px-4 pt-3 text-[15px] leading-relaxed break-words">
          <Markdown text={note.content} />
        </div>
      </div>
    </div>
  );
});
