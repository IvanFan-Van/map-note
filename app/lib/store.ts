import { create } from "zustand";
import { useCanvasStore } from "~/lib/canvas";
import type { Note, PatchEvent } from "~/lib/types";

// 画布视口已解耦到 app/lib/canvas.ts (useCanvasStore)

interface DragNoteState {
  noteId: string;
  offsetX: number;
  offsetY: number;
  previewX: number;
  previewY: number;
}

interface BoardStore {
  notes: Record<string, Note>;
  dragNote: DragNoteState | null;

  setBoardData: (notes: Note[]) => void;
  upsertNote: (note: Note) => void;
  removeNote: (id: string) => void;
  resetBoard: () => void;
  startDragNote: (noteId: string, screenX: number, screenY: number, offsetX: number, offsetY: number) => void;
  updateDragNote: (screenX: number, screenY: number) => void;
  endDragNote: () => DragNoteState | null;
  applyPatch: (patch: PatchEvent) => void;
}

export const useBoardStore = create<BoardStore>((set, get) => ({
  notes: {},
  dragNote: null,

  setBoardData: (notes) => {
    const noteMap: Record<string, Note> = {};
    for (const n of notes) noteMap[n.id] = n;
    set({ notes: noteMap });
  },

  upsertNote: (note) =>
    set((s) => ({ notes: { ...s.notes, [note.id]: note } })),
  removeNote: (id) =>
    set((s) => {
      const notes = { ...s.notes };
      delete notes[id];
      return { notes };
    }),
  // 切板时清空跨板残留状态 (notes/dragNote; 视口由 useCanvasStore.resetViewport 处理)
  resetBoard: () => set({ notes: {}, dragNote: null }),

  startDragNote: (noteId, screenX, screenY, offsetX, offsetY) => {
    const note = get().notes[noteId];
    if (!note) return;
    set({
      dragNote: {
        noteId,
        offsetX,
        offsetY,
        previewX: note.posX,
        previewY: note.posY,
      },
    });
  },
  updateDragNote: (screenX, screenY) => {
    const d = get().dragNote;
    if (!d) return;
    const { viewport } = useCanvasStore.getState();
    const wx = (screenX - viewport.viewX) / viewport.scale;
    const wy = (screenY - viewport.viewY) / viewport.scale;
    set({
      dragNote: {
        ...d,
        previewX: wx - d.offsetX,
        previewY: wy - d.offsetY,
      },
    });
  },
  endDragNote: () => {
    const d = get().dragNote;
    set({ dragNote: null });
    return d;
  },

  applyPatch: (patch) => {
    const s = get();
    if (patch.entity !== "note") return;
    if (patch.changes.deleted) {
      s.removeNote(patch.id);
      return;
    }
    const existing = s.notes[patch.id];
    const merged = { ...existing, ...patch.changes } as Note;
    s.upsertNote(merged);
  },
}));
