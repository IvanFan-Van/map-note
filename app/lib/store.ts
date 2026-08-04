import { create } from "zustand";
import type { Link, Note, PatchEvent } from "~/lib/types";

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
  links: Record<string, Link>;
  viewport: Viewport;
  dragNote: DragNoteState | null;
  linkDrag: { fromNoteId: string; screenX: number; screenY: number } | null;
  selectedLinkId: string | null;
  members: Record<string, { name: string; avatarUrl: string | null }>;

  setBoardData: (notes: Note[], links: Link[]) => void;
  upsertNote: (note: Note) => void;
  upsertLink: (link: Link) => void;
  removeNote: (id: string) => void;
  removeLink: (id: string) => void;
  setViewport: (v: Viewport) => void;
  zoomAt: (screenX: number, screenY: number, factor: number) => void;
  panBy: (dx: number, dy: number) => void;
  startDragNote: (noteId: string, screenX: number, screenY: number, offsetX: number, offsetY: number) => void;
  updateDragNote: (screenX: number, screenY: number) => void;
  endDragNote: () => DragNoteState | null;
  startLinkDrag: (noteId: string, screenX: number, screenY: number) => void;
  updateLinkDrag: (screenX: number, screenY: number) => void;
  endLinkDrag: () => { fromNoteId: string; screenX: number; screenY: number } | null;
  selectLink: (id: string | null) => void;
  setMembers: (members: Record<string, { name: string; avatarUrl: string | null }>) => void;
  applyPatch: (patch: PatchEvent) => void;
}

export function worldToScreen(wx: number, wy: number, v: Viewport) {
  return { sx: wx * v.scale + v.viewX, sy: wy * v.scale + v.viewY };
}

export function screenToWorld(sx: number, sy: number, v: Viewport) {
  return { wx: (sx - v.viewX) / v.scale, wy: (sy - v.viewY) / v.scale };
}

export function pinAnchor(note: Note): { x: number; y: number } {
  return { x: note.posX + note.width / 2, y: note.posY };
}

export const useBoardStore = create<BoardStore>((set, get) => ({
  notes: {},
  links: {},
  viewport: { viewX: 0, viewY: 0, scale: 1 },
  dragNote: null,
  linkDrag: null,
  selectedLinkId: null,
  members: {},

  setBoardData: (notes, links) => {
    const noteMap: Record<string, Note> = {};
    for (const n of notes) noteMap[n.id] = n;
    const linkMap: Record<string, Link> = {};
    for (const l of links) linkMap[l.id] = l;
    set({ notes: noteMap, links: linkMap });
  },

  upsertNote: (note) =>
    set((s) => ({ notes: { ...s.notes, [note.id]: note } })),
  upsertLink: (link) =>
    set((s) => ({ links: { ...s.links, [link.id]: link } })),
  removeNote: (id) =>
    set((s) => {
      const notes = { ...s.notes };
      delete notes[id];
      const links = { ...s.links };
      for (const [k, v] of Object.entries(s.links)) {
        if (v.fromNoteId === id || v.toNoteId === id) delete links[k];
      }
      return { notes, links };
    }),
  removeLink: (id) =>
    set((s) => {
      const links = { ...s.links };
      delete links[id];
      return { links };
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

  startLinkDrag: (fromNoteId, screenX, screenY) =>
    set({ linkDrag: { fromNoteId, screenX, screenY } }),
  updateLinkDrag: (screenX, screenY) =>
    set((s) => (s.linkDrag ? { linkDrag: { ...s.linkDrag, screenX, screenY } } : {})),
  endLinkDrag: () => {
    const d = get().linkDrag;
    set({ linkDrag: null });
    return d;
  },

  selectLink: (selectedLinkId) => set({ selectedLinkId }),

  setMembers: (members) => set({ members }),

  applyPatch: (patch) => {
    const s = get();
    if (patch.entity === "note") {
      if (patch.changes.deleted) {
        s.removeNote(patch.id);
        return;
      }
      const existing = s.notes[patch.id];
      const merged = { ...existing, ...patch.changes } as Note;
      s.upsertNote(merged);
    } else if (patch.entity === "link") {
      if (patch.changes.deleted) {
        s.removeLink(patch.id);
        return;
      }
      const existing = s.links[patch.id];
      const merged = { ...existing, ...patch.changes } as Link;
      s.upsertLink(merged);
    }
  },
}));
