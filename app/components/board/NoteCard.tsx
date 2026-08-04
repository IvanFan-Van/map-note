import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Note } from "~/lib/types";
import { pinAnchor, useBoardStore, worldToScreen } from "~/lib/store";

const MOODS: Record<string, string> = {
  happy: "😊",
  neutral: "😐",
  sad: "😔",
  angry: "😡",
  sleepy: "😴",
};

const WEATHERS: Record<string, string> = {
  sunny: "☀️",
  cloudy: "🌤",
  rainy: "🌧",
  snowy: "🌨",
  stormy: "⛈",
};

export function extractImages(markdown: string): string[] {
  const urls: string[] = [];
  const re = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) && urls.length < 3) {
    urls.push(m[2]);
  }
  return urls;
}

function ThumbnailStack({ images }: { images: string[] }) {
  if (images.length === 0) return null;
  return (
    <div className="relative h-24 mx-3 mt-3">
      {images.map((src, i) => (
        <img
          key={src + i}
          src={src}
          alt=""
          loading="lazy"
          className="absolute inset-0 w-full h-24 object-cover rounded-md shadow-md border border-black/5"
          style={{
            transform: `translate(${i * 7}px, ${i * 5}px) rotate(${i === 0 ? -1 : 2}deg)`,
            zIndex: i,
            opacity: 1 - i * 0.12,
            filter: i === 0 ? "none" : "brightness(0.96)",
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
  onLinkDrop,
}: {
  note: Note;
  isEditor: boolean;
  onClick: (note: Note) => void;
  onMoveCommit: (noteId: string, x: number, y: number) => void;
  onLinkDrop: (fromNoteId: string, screenX: number, screenY: number) => void;
}) {
  const viewport = useBoardStore((s) => s.viewport);
  const dragNote = useBoardStore((s) => s.dragNote);
  const startDragNote = useBoardStore((s) => s.startDragNote);
  const updateDragNote = useBoardStore((s) => s.updateDragNote);
  const endDragNote = useBoardStore((s) => s.endDragNote);
  const startLinkDrag = useBoardStore((s) => s.startLinkDrag);
  const updateLinkDrag = useBoardStore((s) => s.updateLinkDrag);
  const endLinkDrag = useBoardStore((s) => s.endLinkDrag);

  const isDragging = dragNote?.noteId === note.id;
  const posX = isDragging ? dragNote.previewX : note.posX;
  const posY = isDragging ? dragNote.previewY : note.posY;
  const { sx, sy } = worldToScreen(posX, posY, viewport);
  const w = note.width * viewport.scale;

  const images = extractImages(note.content);

  const handlePinDown = (e: React.PointerEvent) => {
    if (!isEditor) return;
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    startLinkDrag(note.id, e.clientX, e.clientY);
    const onMove = (ev: PointerEvent) => updateLinkDrag(ev.clientX, ev.clientY);
    const onUp = (ev: PointerEvent) => {
      el.releasePointerCapture(e.pointerId);
      const drag = endLinkDrag();
      if (drag) onLinkDrop(drag.fromNoteId, ev.clientX, ev.clientY);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
  };

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
    startDragNote(note.id, e.clientX, e.clientY, wx - note.posX, wy - note.posY);
    const onMove = (ev: PointerEvent) => updateDragNote(ev.clientX, ev.clientY);
    const onUp = (ev: PointerEvent) => {
      const moved = endDragNote();
      if (moved) {
        const delta = Math.abs(ev.clientX - e.clientX) + Math.abs(ev.clientY - e.clientY);
        if (delta < 5) {
          onClick(note); // 视为点击 → 打开编辑器
        } else {
          onMoveCommit(note.id, moved.previewX, moved.previewY);
        }
      }
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
        left: sx,
        top: sy,
        width: w,
        zIndex: isDragging ? 9999 : note.zIndex,
        opacity: isDragging ? 0.45 : 1,
        touchAction: "none",
      }}
    >
      <div
        className="note-card rounded-md px-4 pt-6 pb-5 shadow-[0_6px_18px_rgba(120,100,60,0.25)] relative cursor-pointer"
        onPointerDown={handleBodyDown}
        onDoubleClick={() => onClick(note)}
      >
        {/* 大头钉 */}
        <div
          className="absolute left-1/2 -translate-x-1/2 -top-3 z-20"
          style={{ cursor: isEditor ? "crosshair" : "default" }}
          onPointerDown={handlePinDown}
        >
          <svg width="20" height="20" viewBox="0 0 20 20">
            <circle cx="10" cy="9" r="7" fill="#e05252" stroke="#b33737" strokeWidth="1.5" />
            <circle cx="7.5" cy="6.5" r="2.2" fill="#ffd0d0" />
            <rect x="9" y="13" width="2" height="5" rx="1" fill="#8a8a8a" />
          </svg>
        </div>

        {images.length > 0 && <ThumbnailStack images={images} />}

        <div className="prose-note line-clamp-8 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 text-[15px] leading-relaxed break-words">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ children, ...props }) => (
                <a {...props} className="text-blue-600 underline break-all">
                  {children}
                </a>
              ),
              img: () => null,
              h1: ({ children }) => <div className="text-xl font-bold mt-1">{children}</div>,
              h2: ({ children }) => <div className="text-lg font-bold mt-1">{children}</div>,
              h3: ({ children }) => <div className="text-base font-bold mt-1">{children}</div>,
              p: ({ children }) => <p className="mt-1">{children}</p>,
              ul: ({ children }) => <ul className="list-disc pl-5 mt-1">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal pl-5 mt-1">{children}</ol>,
              li: ({ children }) => <li className="mt-0.5">{children}</li>,
              strong: ({ children }) => <strong className="font-bold">{children}</strong>,
              blockquote: ({ children }) => (
                <blockquote className="border-l-2 border-warm/30 pl-2 italic mt-1">{children}</blockquote>
              ),
            }}
          >
            {note.content}
          </ReactMarkdown>
        </div>

        {/* 快捷状态 */}
        {(note.mood || note.weather || note.fatigue != null || note.diet) && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            {note.mood && <span title="心情">{MOODS[note.mood] ?? "❓"}</span>}
            {note.weather && <span title="天气">{WEATHERS[note.weather] ?? "❓"}</span>}
            {note.fatigue != null && (
              <span title={`疲惫 ${note.fatigue}/10`} className="text-warm/60">
                ⚡{note.fatigue}
              </span>
            )}
            {note.diet && <span title="进食" className="text-warm/60 truncate max-w-[60%]">🍽 {note.diet}</span>}
          </div>
        )}
      </div>
    </div>
  );
});
