import { useEffect, useRef } from "react";
import { renderAnnotation } from "rough-notation/lib/render.js";
import type { RoughAnnotationConfig } from "rough-notation/lib/model.js";
import type { AnnotationType } from "~/lib/markdown";

/** 各注解的 rough 绘制色 (工具栏深底背景上用浅色系, 与正文 ANNOTATION_STYLE 分离) */
const ICON_COLOR: Record<AnnotationType, string> = {
  underline: "#f5f0e1",
  box: "#3b82f6",
  circle: "#3b82f6",
  highlight: "#fde68a",
  "strike-through": "#dc2626",
  "crossed-off": "#dc2626",
  bracket: "#3b82f6",
};

function seedOf(type: string): number {
  let seed = 0;
  for (const ch of type) seed += ch.charCodeAt(0);
  return seed;
}

/**
 * 用 rough-notation 的渲染管线在 SVG 中绘制注解效果图标
 * (与正文注解同引擎, 观感一致; seed 固定避免重渲染时形状抖动)
 */
export function AnnotationIcon({
  type,
  color,
}: {
  type: AnnotationType | "multiline";
  color?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.replaceChildren();
    if (type === "multiline") {
      // 三条平行短线, 表示三连标记 (多行)
      for (const y of [5, 12, 19]) {
        renderAnnotation(
          svg,
          { x: 3, y: y - 1.5, w: 18, h: 3 },
          {
            type: "strike-through",
            color: color ?? "#f5f0e1",
            strokeWidth: 1.4,
            animate: false,
          },
          0,
          0,
          seedOf(type + y),
        );
      }
      return;
    }
    const config: RoughAnnotationConfig = {
      type,
      color: color ?? ICON_COLOR[type],
      strokeWidth: type === "highlight" ? 7 : 1.6,
      padding: type === "highlight" ? 0 : [2, 2],
      animate: false,
      ...(type === "bracket" ? { brackets: ["left", "right"] as const } : {}),
    };
    const rect =
      type === "highlight" ? { x: 3, y: 9, w: 18, h: 6 } : { x: 2, y: 4, w: 20, h: 16 };
    renderAnnotation(svg, rect, config, 0, 0, seedOf(type));
  }, [type, color]);

  return (
    <svg
      ref={svgRef}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    />
  );
}
