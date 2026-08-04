import { memo, useEffect, useRef } from "react";
import { annotate } from "rough-notation";
import type { RoughAnnotationConfig, RoughAnnotationType } from "rough-notation/lib/model.js";
import {
  inlineText,
  parseBlocks,
  parseInline,
  type AnnotationType,
  type Block,
  type InlineToken,
} from "~/lib/markdown";

export const ANNOTATION_STYLE: Record<
  AnnotationType,
  { type: RoughAnnotationType; color: string; strokeWidth: number; brackets?: RoughAnnotationConfig["brackets"] }
> = {
  underline: { type: "underline", color: "#4a4238", strokeWidth: 1.4 },
  box: { type: "box", color: "#3b82f6", strokeWidth: 1.4 },
  circle: { type: "circle", color: "#3b82f6", strokeWidth: 1.4 },
  highlight: { type: "highlight", color: "#fde68a", strokeWidth: 7 },
  "strike-through": { type: "strike-through", color: "#dc2626", strokeWidth: 1.4 },
  "crossed-off": { type: "crossed-off", color: "#dc2626", strokeWidth: 1.4 },
  bracket: { type: "bracket", color: "#3b82f6", strokeWidth: 1.4, brackets: ["left", "right"] },
};

export const Markdown = memo(function Markdown({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <div className={className}>
      {parseBlocks(text).map((block, i) => (
        <BlockView key={i} block={block} />
      ))}
    </div>
  );
});

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case "title":
      return (
        <h1 className="text-xl font-bold mt-1">{<Inline tokens={parseInline(block.content)} />}</h1>
      );
    case "ul":
      return (
        <div className="flex gap-2 mt-1">
          <span className="shrink-0">•</span>
          <span className="flex-1">
            <Inline tokens={parseInline(block.content)} />
          </span>
        </div>
      );
    case "ol":
      return (
        <div className="flex gap-2 mt-1">
          <span className="shrink-0">{block.order}.</span>
          <span className="flex-1">
            <Inline tokens={parseInline(block.content)} />
          </span>
        </div>
      );
    case "quote":
      return (
        <div className="border-l-2 border-warm/30 pl-2 italic mt-1 text-warm/80">
          <Inline tokens={parseInline(block.content)} />
        </div>
      );
    case "image":
      return (
        <img
          src={block.src}
          alt={block.alt}
          className="max-w-full rounded border border-warm/10 my-1"
        />
      );
    case "empty":
      return <div className="h-3" />;
    case "paragraph":
    default:
      return (
        <p className="mt-1 leading-relaxed">
          <Inline tokens={parseInline(block.content)} />
        </p>
      );
  }
}

function Inline({ tokens }: { tokens: InlineToken[] }) {
  return (
    <>
      {tokens.map((t, i) => {
        switch (t.type) {
          case "text":
            return <span key={i}>{t.text}</span>;
          case "bold":
            return (
              <strong key={i}>
                <Inline tokens={t.children} />
              </strong>
            );
          case "italic":
            return (
              <em key={i}>
                <Inline tokens={t.children} />
              </em>
            );
          case "code":
            return (
              <code key={i} className="bg-warm/10 rounded px-1 py-0.5 text-[0.9em]">
                {t.text}
              </code>
            );
          case "link":
            return (
              <a
                key={i}
                href={t.href}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 underline break-all"
              >
                <Inline tokens={t.children} />
              </a>
            );
          case "image":
            return (
              <img
                key={i}
                src={t.src}
                alt={t.alt}
                className="max-w-full rounded border border-warm/10 my-1"
              />
            );
          case "annotate":
            return (
              <Annotation key={i} type={t.annotation} multiline={t.multiline} color={t.color} textKey={inlineText(t.children)}>
                <Inline tokens={t.children} />
              </Annotation>
            );
        }
      })}
    </>
  );
}

function Annotation({
  type,
  multiline,
  color,
  textKey,
  children,
}: {
  type: AnnotationType;
  multiline: boolean;
  color?: string;
  textKey: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const style = ANNOTATION_STYLE[type];
    const annotation = annotate(el, {
      ...style,
      color: color ?? style.color,
      padding: [2, 2],
      multiline,
      animate: false,
    });
    annotation.show();
    return () => annotation.remove();
  }, [type, multiline, color, textKey]);

  return (
    <span ref={ref} data-annotation={type}>
      {children}
    </span>
  );
}
