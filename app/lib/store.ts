import { create } from "zustand";
import type { Note, PatchEvent } from "~/lib/types";

export interface Viewport {
  viewX: number;
  viewY: number;
  scale: number;
}

export const MIN_SCALE = 0.25;
export const MAX_SCALE = 4;

interface DragNoteState {
  noteId: string;
  offsetX: number;
  offsetY: number;
  previewX: number;
  previewY: number;
}

interface BoardStore {
  notes: Record<string, Note>;
  viewport: Viewport;
  dragNote: DragNoteState | null;
  selectedNoteId: string | null;
  members: Record<string, { name: string; avatarUrl: string | null }>;

  setBoardData: (notes: Note[]) => void;
  upsertNote: (note: Note) => void;
  removeNote: (id: string) => void;
  setViewport: (v: Viewport) => void;
  zoomAt: (screenX: number, screenY: number, factor: number) => void;
  panBy: (dx: number, dy: number) => void;
  startDragNote: (noteId: string, screenX: number, screenY: number, offsetX: number, offsetY: number) => void;
  updateDragNote: (screenX: number, screenY: number) => void;
  endDragNote: () => DragNoteState | null;
  selectNote: (id: string | null) => void;
  setMembers: (members: Record<string, { name: string; avatarUrl: string | null }>) => void;
  applyPatch: (patch: PatchEvent) => void;
}

export function worldToScreen(wx: number, wy: number, v: Viewport) {
  return { sx: wx * v.scale + v.viewX, sy: wy * v.scale + v.viewY };
}

export function screenToWorld(sx: number, sy: number, v: Viewport) {
  return { wx: (sx - v.viewX) / v.scale, wy: (sy - v.viewY) / v.scale };
}

export const useBoardStore = create<BoardStore>((set, get) => ({
  notes: {},
  viewport: { viewX: 0, viewY: 0, scale: 1 },
  dragNote: null,
  selectedNoteId: null,
  members: {},

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

  setViewport: (viewport) => set({ viewport }),
  zoomAt: (screenX, screenY, factor) => {
    const v = get().viewport;
    const wx = (screenX - v.viewX) / v.scale;
    const wy = (screenY - v.viewY) / v.scale;
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
    set({
      viewport: {
        viewX: screenX - wx * scale,
        viewY: screenY - wy * scale,
        scale,
      },
    });
  },
  panBy: (dx, dy) => {
    const v = get().viewport;
    set({ viewport: { ...v, viewX: v.viewX + dx, viewY: v.viewY + dy } });
  },

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
    const v = get().viewport;
    const { wx, wy } = screenToWorld(screenX, screenY, v);
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

  selectNote: (selectedNoteId) => set({ selectedNoteId }),

  setMembers: (members) => set({ members }),

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
