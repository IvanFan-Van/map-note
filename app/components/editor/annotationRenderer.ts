import { useEffect, useRef } from "react";
import type { Editor } from "@tiptap/react";
import { renderAnnotation } from "rough-notation/lib/render.js";
import type { RoughAnnotationConfig } from "rough-notation/lib/model.js";
import { ANNOTATION_STYLE, seedOf, type AnnotationType } from "~/lib/markdown";

/**
 * 编辑器注解绘制管线 (overlay 版):
 * 在编辑器内容上方叠加一个绝对定位的 svg, 每次同步把全部 [data-annotation]
 * span 的 rect 重绘到 overlay 中。与 ProseMirror 的 contentDOM 完全解耦 —
 * view.update 重建 DOM 不影响绘制。固定 seed → 形状稳定。
 */

export function useAnnotationRenderer(editor: Editor | null) {
  const containerRef = useRef<HTMLDivElement>(null);
  // underlay: highlight 画在文本下层 (与 rough-notation 卡片语义一致,
  // 粗线贯穿文字高度, 在文字上层会遮住字体)
  const underlayRef = useRef<SVGSVGElement>(null);
  const overlayRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!editor) return;

    const draw = () => {
      const container = containerRef.current;
      const underlay = underlayRef.current;
      const overlay = overlayRef.current;
      if (!container || !underlay || !overlay) return;
      overlay.replaceChildren();
      underlay.replaceChildren();
      const overlayRect = overlay.getBoundingClientRect();
      container
        .querySelectorAll<HTMLElement>("span[data-annotation]")
        .forEach((el) => {
          const type = (el.getAttribute("data-annotation") ?? "box") as AnnotationType;
          const multiline = el.hasAttribute("data-multiline");
          const color = el.getAttribute("data-color") ?? undefined;
          const style = ANNOTATION_STYLE[type];
          const config: RoughAnnotationConfig = {
            ...style,
            color: color ?? style.color,
            padding: [2, 2],
            animate: false,
            ...(type === "bracket" ? { brackets: ["left", "right"] as const } : {}),
          };
          const seed = seedOf(`${type}|${multiline}|${color ?? ""}`);
          const svg = type === "highlight" ? underlay : overlay;
          const rects = multiline
            ? Array.from(el.getClientRects())
            : [el.getBoundingClientRect()];
          for (const r of rects) {
            if (r.width === 0 || r.height === 0) continue;
            renderAnnotation(
              svg,
              { x: r.left - overlayRect.left, y: r.top - overlayRect.top, w: r.width, h: r.height },
              config,
              0,
              0,
              seed,
            );
          }
        });
    };

    // transaction 事件在 ProseMirror DOM 更新前触发, 延迟到 DOM 更新后绘制
    let rafId: number | null = null;
    const scheduleDraw = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        draw();
      });
    };
    scheduleDraw();
    editor.on("transaction", scheduleDraw);
    return () => {
      editor.off("transaction", scheduleDraw);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [editor]);

  return { containerRef, underlayRef, overlayRef };
}
