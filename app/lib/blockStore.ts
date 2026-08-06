import { create } from "zustand";
import { useCanvasStore } from "~/lib/canvas";
import type { Block, PatchEvent } from "~/lib/types";

// ---------- 无限画布板的内容物 (文本块) 状态 ----------

interface DragBlockState {
  blockId: string;
  offsetX: number;
  offsetY: number;
  previewX: number;
  previewY: number;
}

interface BlockStore {
  blocks: Record<string, Block>;
  dragBlock: DragBlockState | null;

  setBlockData: (blocks: Block[]) => void;
  upsertBlock: (block: Block) => void;
  removeBlock: (id: string) => void;
  resetBlocks: () => void;
  startDragBlock: (blockId: string, screenX: number, screenY: number, offsetX: number, offsetY: number) => void;
  updateDragBlock: (screenX: number, screenY: number) => void;
  endDragBlock: () => DragBlockState | null;
  applyPatch: (patch: PatchEvent) => void;
}

export const useBlockStore = create<BlockStore>((set, get) => ({
  blocks: {},
  dragBlock: null,

  setBlockData: (blocks) => {
    const blockMap: Record<string, Block> = {};
    for (const b of blocks) blockMap[b.id] = b;
    set({ blocks: blockMap });
  },
  upsertBlock: (block) =>
    set((s) => ({ blocks: { ...s.blocks, [block.id]: block } })),
  removeBlock: (id) =>
    set((s) => {
      const blocks = { ...s.blocks };
      delete blocks[id];
      return { blocks };
    }),
  // 切板时清空跨板残留状态 (blocks/dragBlock; 视口由 useCanvasStore.resetViewport 处理)
  resetBlocks: () => set({ blocks: {}, dragBlock: null }),

  startDragBlock: (blockId, screenX, screenY, offsetX, offsetY) => {
    const block = get().blocks[blockId];
    if (!block) return;
    set({
      dragBlock: {
        blockId,
        offsetX,
        offsetY,
        previewX: block.posX,
        previewY: block.posY,
      },
    });
  },
  updateDragBlock: (screenX, screenY) => {
    const d = get().dragBlock;
    if (!d) return;
    const { viewport } = useCanvasStore.getState();
    const wx = (screenX - viewport.viewX) / viewport.scale;
    const wy = (screenY - viewport.viewY) / viewport.scale;
    set({
      dragBlock: {
        ...d,
        previewX: wx - d.offsetX,
        previewY: wy - d.offsetY,
      },
    });
  },
  endDragBlock: () => {
    const d = get().dragBlock;
    set({ dragBlock: null });
    return d;
  },

  applyPatch: (patch) => {
    const s = get();
    if (patch.entity !== "block") return;
    if (patch.changes.deleted) {
      s.removeBlock(patch.id);
      return;
    }
    const existing = s.blocks[patch.id];
    const merged = { ...existing, ...patch.changes } as Block;
    s.upsertBlock(merged);
  },
}));
