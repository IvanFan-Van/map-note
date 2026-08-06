import { useCallback, useEffect, useRef, useState } from "react";
import {
  screenToWorld,
  useCanvasStore,
  type Viewport,
} from "~/lib/canvas";

// ---------- 通用画布 (平移/缩放/双击空白/网格/左下角提示) ----------
// 与内容物解耦: 便笺板与无限画布板共用; children 渲染在世界坐标层内。

export interface HintItem {
  kbd: string;
  text: string;
}

const DEFAULT_HINTS: HintItem[] = [
  { kbd: "Ctrl+滚轮", text: "缩放" },
  { kbd: "拖拽", text: "平移" },
  { kbd: "双击", text: "新建便笺" },
];

export function CanvasBoard({
  hintKey,
  hintItems = DEFAULT_HINTS,
  children,
  onBlankDoubleClick,
  onBlankClick,
}: {
  hintKey: string;
  hintItems?: HintItem[];
  children: React.ReactNode;
  onBlankDoubleClick?: (e: React.MouseEvent, world: { wx: number; wy: number }) => void;
  onBlankClick?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewport = useCanvasStore((s) => s.viewport);
  const setViewport = useCanvasStore((s) => s.setViewport);
  const zoomAt = useCanvasStore((s) => s.zoomAt);
  const panBy = useCanvasStore((s) => s.panBy);

  // 左下角操作提示 (可收起, localStorage 记忆)
  const [hintHidden, setHintHidden] = useState(
    () =>
      typeof localStorage !== "undefined" &&
      localStorage.getItem(hintKey) === "1",
  );
  const hideHint = useCallback(() => {
    setHintHidden(true);
    localStorage.setItem(hintKey, "1");
  }, [hintKey]);

  // 平移与缩放手势状态机
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const panRef = useRef<{ startX: number; startY: number; viewX: number; viewY: number } | null>(null);
  const pinchRef = useRef<{ dist: number; midX: number; midY: number } | null>(null);

  // 手势状态兜底: 失焦/页面隐藏/指针取消时清空, 防止残留 pointerId
  // 使单指拖动被误判为双指缩放 (平移失效不可恢复)
  const resetGestures = useCallback(() => {
    pointersRef.current.clear();
    panRef.current = null;
    pinchRef.current = null;
  }, []);

  useEffect(() => {
    const onCleanup = () => resetGestures();
    window.addEventListener("blur", onCleanup);
    window.addEventListener("pointercancel", onCleanup);
    document.addEventListener("visibilitychange", onCleanup);
    return () => {
      window.removeEventListener("blur", onCleanup);
      window.removeEventListener("pointercancel", onCleanup);
      document.removeEventListener("visibilitychange", onCleanup);
    };
  }, [resetGestures]);

  const handlePointerDown = (e: React.PointerEvent) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 1) {
      const vp = useCanvasStore.getState().viewport;
      panRef.current = { startX: e.clientX, startY: e.clientY, viewX: vp.viewX, viewY: vp.viewY };
      pinchRef.current = null;
    } else if (pointersRef.current.size === 2) {
      panRef.current = null;
      const [p1, p2] = [...pointersRef.current.values()];
      pinchRef.current = {
        dist: Math.hypot(p1.x - p2.x, p1.y - p2.y),
        midX: (p1.x + p2.x) / 2,
        midY: (p1.y + p2.y) / 2,
      };
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2 && pinchRef.current) {
      const [p1, p2] = [...pointersRef.current.values()];
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      const factor = dist / pinchRef.current.dist;
      if (Number.isFinite(factor) && factor > 0) {
        zoomAt(midX, midY, factor);
      }
      pinchRef.current = { dist, midX, midY };
      return;
    }
    if (panRef.current) {
      // 绝对定位: viewport = 按下时视口 + 当前指针相对起点的偏移。
      // 不能用 panBy 增量累加绝对偏移 (会随 move 次数累积偏差, 且方向切换时行为错误)
      const vp = useCanvasStore.getState().viewport;
      const pan = panRef.current;
      setViewport({
        ...vp,
        viewX: pan.viewX + (e.clientX - pan.startX),
        viewY: pan.viewY + (e.clientY - pan.startY),
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 0) panRef.current = null;
  };

  // 缩放/平移滚轮 (原生非 passive 监听, 否则 preventDefault 无效, Ctrl+滚轮会触发浏览器缩放)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.1 : 1 / 1.1);
      } else {
        e.preventDefault();
        panBy(-e.deltaX, -e.deltaY);
      }
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [zoomAt, panBy]);

  // 空白处双击 (排除便笺/文本块元素), 世界坐标交给调用方
  const handleDoubleClick = (e: React.MouseEvent) => {
    if (!onBlankDoubleClick) return;
    const el = e.target as HTMLElement;
    if (el.closest("[data-note], [data-block]")) return;
    const vp = useCanvasStore.getState().viewport;
    onBlankDoubleClick(e, screenToWorld(e.clientX, e.clientY, vp));
  };

  // 空白处单击 (取消选中)
  const handleClick = (e: React.MouseEvent) => {
    if (!onBlankClick) return;
    const el = e.target as HTMLElement;
    if (el.closest("[data-note], [data-block]")) return;
    onBlankClick();
  };

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ touchAction: "none" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      onClick={handleClick}
    >
      <div
        className="absolute top-0 left-0"
        style={{
          transform: `translate(${viewport.viewX}px, ${viewport.viewY}px) scale(${viewport.scale})`,
          transformOrigin: "0 0",
        }}
      >
        {/* 网格背景 */}
        <GridBackground scale={viewport.scale} />
        {children}
      </div>

      {/* 左下角: 操作提示 (可收起) + 缩放指示 */}
      <div className="absolute bottom-4 left-4 z-[200] flex items-center gap-2">
        {!hintHidden && (
          /* 手写中文字体优先 (kbd 需覆盖 Tailwind preflight 的等宽字体) */
          <div
            className="flex items-center gap-3 rounded-full bg-white/80 backdrop-blur px-3 py-1.5 text-sm text-warm/70"
            style={{ fontFamily: "'LeMiXiaoNaiPaoTi', var(--font-sans)" }}
          >
            {hintItems.map((h) => (
              <span key={h.kbd + h.text} className="flex items-center gap-1 whitespace-nowrap">
                <kbd
                  className="rounded border border-warm/20 bg-white px-1 text-xs"
                  style={{ fontFamily: "inherit" }}
                >
                  {h.kbd}
                </kbd>
                {h.text}
              </span>
            ))}
            <button
              onClick={hideHint}
              className="text-warm/40 hover:text-warm/70 text-xs px-0.5"
              title="隐藏操作提示"
            >
              ✕
            </button>
          </div>
        )}
        <div className="rounded-full bg-white/80 backdrop-blur px-3 py-1 text-sm text-warm/70">
          {Math.round(viewport.scale * 100)}%
        </div>
      </div>
    </div>
  );
}

export function GridBackground({ scale }: { scale: number }) {
  const size = 40 * scale;
  return (
    <div
      className="absolute"
      style={{
        width: "100vw",
        height: "100vh",
        backgroundImage:
          "radial-gradient(circle, rgba(120,100,60,0.16) 1px, transparent 1px)",
        backgroundSize: `${size}px ${size}px`,
        transform: "translate(0,0)",
      }}
    />
  );
}

export function useCanvasViewport(): Viewport {
  return useCanvasStore((s) => s.viewport);
}
