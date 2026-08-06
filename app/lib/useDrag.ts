import { useCallback } from "react";
import { screenToWorld } from "~/lib/canvas";
import type { Viewport } from "~/lib/canvas";

// ---------- 画布内容物通用拖拽 (便笺卡片 / 文本块共用) ----------
// 阈值后才进入拖拽态 (视觉半透明); 单击不触发; 双击由画布层 onDoubleClick 处理。
// 拖拽中的预览位置由调用方的 store 提供 (dragTo 持续更新), 本 hook 只负责
// 指针事件生命周期 (阈值判定 / capture / 清理)。

export interface DragCallbacks {
  beginDrag: (
    id: string,
    screenX: number,
    screenY: number,
    offsetX: number,
    offsetY: number,
  ) => void;
  dragTo: (id: string, screenX: number, screenY: number) => void;
  endDrag: () => { previewX: number; previewY: number } | null;
  isDragging: (id: string) => boolean;
}

export function useDragItem(
  id: string,
  posX: number,
  posY: number,
  enabled: boolean,
  getViewport: () => Viewport,
  { beginDrag, dragTo, endDrag, isDragging }: DragCallbacks,
  onCommit: (id: string, x: number, y: number) => void,
) {
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled) return;
      if (e.button !== 0) return;
      e.stopPropagation();
      // 注意: 不能 preventDefault() — 取消 pointerdown 会抑制后续兼容鼠标事件
      // (click/dblclick), 导致双击无法进入编辑; 文本选择由 select-none 阻止
      const el = (e.currentTarget as HTMLElement).parentElement as HTMLElement;
      el.setPointerCapture(e.pointerId);
      const vp = getViewport();
      const { wx, wy } = screenToWorld(e.clientX, e.clientY, vp);
      const startX = e.clientX;
      const startY = e.clientY;
      const offsetX = wx - posX;
      const offsetY = wy - posY;
      let dragging = false;
      const onMove = (ev: PointerEvent) => {
        if (!dragging) {
          const dist = Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY);
          if (dist < 6) return;
          dragging = true;
          beginDrag(id, startX, startY, offsetX, offsetY);
        }
        dragTo(id, ev.clientX, ev.clientY);
      };
      const onUp = (_ev: PointerEvent) => {
        if (dragging) {
          const moved = endDrag();
          if (moved) onCommit(id, moved.previewX, moved.previewY);
        }
        // pointerup 前捕获已隐式释放, 显式释放需先检查, 否则抛 NotFoundError 中断清理
        if (el.hasPointerCapture(e.pointerId)) {
          el.releasePointerCapture(e.pointerId);
        }
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerup", onUp);
      };
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", onUp);
    },
    [enabled, id, posX, posY, getViewport, beginDrag, dragTo, endDrag, onCommit],
  );

  return { handlePointerDown, isDragging: isDragging(id) };
}
