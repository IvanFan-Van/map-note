import { create } from "zustand";

// ---------- 画布视口 (与具体内容物解耦, 供便笺板/无限画布板共用) ----------

export interface Viewport {
  viewX: number;
  viewY: number;
  scale: number;
}

export const MIN_SCALE = 0.25;
export const MAX_SCALE = 4;

export function screenToWorld(sx: number, sy: number, v: Viewport) {
  return { wx: (sx - v.viewX) / v.scale, wy: (sy - v.viewY) / v.scale };
}

interface CanvasStore {
  viewport: Viewport;
  setViewport: (v: Viewport) => void;
  zoomAt: (screenX: number, screenY: number, factor: number) => void;
  panBy: (dx: number, dy: number) => void;
  resetViewport: () => void;
}

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  viewport: { viewX: 0, viewY: 0, scale: 1 },
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
  resetViewport: () => set({ viewport: { viewX: 0, viewY: 0, scale: 1 } }),
}));
