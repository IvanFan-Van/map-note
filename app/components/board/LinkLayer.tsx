import { memo } from "react";
import { jsonApi } from "~/lib/api";
import type { Link, Note } from "~/lib/types";
import { pinAnchor, worldToScreen, useBoardStore } from "~/lib/store";

export const LINK_COLORS = [
  "#e11d48",
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#8b5cf6",
  "#64748b",
];

function linkPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.max(48, Math.abs(x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

export const LinkLayer = memo(function LinkLayer({
  notes,
  links,
  isEditor,
}: {
  notes: Record<string, Note>;
  links: Record<string, Link>;
  isEditor: boolean;
}) {
  const viewport = useBoardStore((s) => s.viewport);
  const linkDrag = useBoardStore((s) => s.linkDrag);
  const selectedLinkId = useBoardStore((s) => s.selectedLinkId);
  const selectLink = useBoardStore((s) => s.selectLink);
  const removeLink = useBoardStore((s) => s.removeLink);
  const updateLinkLocal = useBoardStore((s) => s.upsertLink);

  const pinOf = (noteId: string) => {
    const note = notes[noteId];
    if (!note) return null;
    const { x, y } = pinAnchor(note);
    return worldToScreen(x, y, viewport);
  };

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none z-[100]">
      {Object.values(links).map((link) => {
        const a = pinOf(link.fromNoteId);
        const b = pinOf(link.toNoteId);
        if (!a || !b) return null;
        const selected = selectedLinkId === link.id;
        return (
          <g
            key={link.id}
            className="pointer-events-auto cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              if (!isEditor) return;
              selectLink(selected ? null : link.id);
            }}
          >
            <path
              d={linkPath(a.sx, a.sy, b.sx, b.sy)}
              fill="none"
              stroke={link.color}
              strokeWidth={link.thickness}
              strokeLinecap="round"
            />
            <path
              d={linkPath(a.sx, a.sy, b.sx, b.sy)}
              fill="none"
              stroke="transparent"
              strokeWidth={18}
              style={{ strokeWidth: 18 }}
            />
            {selected && (
              <path
                d={linkPath(a.sx, a.sy, b.sx, b.sy)}
                fill="none"
                stroke="#3b82f6"
                strokeWidth={link.thickness + 4}
                strokeLinecap="round"
                opacity={0.5}
              />
            )}
          </g>
        );
      })}

      {linkDrag && (() => {
        const a = pinOf(linkDrag.fromNoteId);
        if (!a) return null;
        return (
          <path
            d={linkPath(a.sx, a.sy, linkDrag.screenX, linkDrag.screenY)}
            fill="none"
            stroke="#e11d48"
            strokeWidth={2}
            strokeDasharray="6 4"
            strokeLinecap="round"
          />
        );
      })()}

      {selectedLinkId && isEditor && links[selectedLinkId] && (
        <g className="pointer-events-auto" onPointerDown={(e) => e.stopPropagation()}>
          <foreignObject
            x={viewport.viewX}
            y={viewport.viewY + 12}
            width={260}
            height={150}
            className="overflow-visible"
          >
            <div className="rounded-2xl bg-white shadow-xl p-3 pointer-events-auto">
              <div className="flex items-center gap-1.5 flex-wrap">
                {LINK_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      updateLinkLocal({ ...links[selectedLinkId], color: c });
                      void jsonApi(`/api/links/${selectedLinkId}`, "PATCH", { color: c }).catch(
                        () => void 0,
                      );
                    }}
                    className="w-6 h-6 rounded-full border border-black/10 hover:scale-110 transition-transform"
                    style={{ background: c }}
                    aria-label={`颜色 ${c}`}
                  />
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-warm/60">粗细</span>
                <input
                  type="range"
                  min={1}
                  max={6}
                  step={0.5}
                  value={links[selectedLinkId].thickness}
                  onChange={(e) => {
                    const thickness = Number(e.target.value);
                    updateLinkLocal({ ...links[selectedLinkId], thickness });
                    void jsonApi(`/api/links/${selectedLinkId}`, "PATCH", { thickness }).catch(
                      () => void 0,
                    );
                  }}
                  className="flex-1 accent-red-500"
                />
                <span className="text-xs text-warm/60 w-6">
                  {links[selectedLinkId].thickness}
                </span>
              </div>
              <button
                onClick={() => {
                  removeLink(selectedLinkId);
                  void jsonApi(`/api/links/${selectedLinkId}`, "DELETE").catch(() => void 0);
                }}
                className="mt-2 w-full rounded-xl bg-red-50 text-red-500 py-1.5 text-sm hover:bg-red-100"
              >
                删除连线
              </button>
            </div>
          </foreignObject>
        </g>
      )}
    </svg>
  );
});
