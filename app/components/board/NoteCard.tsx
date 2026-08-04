import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Note } from "~/lib/types";
import { useBoardStore } from "~/lib/store";

const NOTE_WIDTH = 240;
const NOTE_HEIGHT = 320;

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

        {/* 快捷状态栏 (固定底部) */}
        {(note.mood || note.weather || note.fatigue != null || note.diet) && (
          <div className="shrink-0 flex items-center gap-2 border-t border-warm/10 px-4 py-2 text-sm text-warm/70">
            {note.mood && <span title="心情">{MOODS[note.mood] ?? "❓"}</span>}
            {note.weather && <span title="天气">{WEATHERS[note.weather] ?? "❓"}</span>}
            {note.fatigue != null && <span title={`疲惫 ${note.fatigue}/10`}>⚡{note.fatigue}</span>}
            {note.diet && <span title="进食" className="truncate">🍽 {note.diet}</span>}
          </div>
        )}
      </div>
    </div>
  );
});
