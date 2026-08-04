/**
 * 自研迷你 Markdown 解析器 (无第三方依赖)。
 *
 * 行级: 标题 #/##/###、无序列表 -、有序列表 1.、引用 >、图片行、段落
 * 行内: 加粗 **、斜体 *、行内代码 `、链接 [t](u)、图片 ![a](u)
 * 注解 (rough-notation 持久化): ==高亮== ^^下划线^^ [[方框]] ((圆圈)) ~~删除线~~ ××划掉×× ⟦括号⟧
 *   三连标记 (=== ^^^ [[[ ((( ~~~ ××× ⟦⟦) 表示 multiline 变体 (多行文本每行分别标注)
 */

export type AnnotationType =
  | "underline"
  | "box"
  | "circle"
  | "highlight"
  | "strike-through"
  | "crossed-off"
  | "bracket";

export type Block =
  | { type: "title"; level: number; content: string }
  | { type: "ul"; content: string }
  | { type: "ol"; order: number; content: string }
  | { type: "quote"; content: string }
  | { type: "image"; src: string; alt: string }
  | { type: "paragraph"; content: string }
  | { type: "empty" };

export type InlineToken =
  | { type: "text"; text: string }
  | { type: "bold"; children: InlineToken[] }
  | { type: "italic"; children: InlineToken[] }
  | { type: "code"; text: string }
  | { type: "link"; href: string; children: InlineToken[] }
  | { type: "image"; src: string; alt: string }
  | {
      type: "annotate";
      annotation: AnnotationType;
      multiline: boolean;
      children: InlineToken[];
    };

// ---------- 行级解析 ----------

export function parseBlocks(md: string): Block[] {
  const lines = md.split("\n");
  const blocks: Block[] = [];
  let olCounter: number | null = null;
  for (const line of lines) {
    if (line.trim() === "") {
      blocks.push({ type: "empty" });
      olCounter = null;
      continue;
    }
    const title = /^(#{1,3})\s+(.*)$/.exec(line);
    if (title) {
      blocks.push({ type: "title", level: title[1].length, content: title[2] });
      olCounter = null;
      continue;
    }
    const ul = /^[-*]\s+(.*)$/.exec(line);
    if (ul) {
      blocks.push({ type: "ul", content: ul[1] });
      olCounter = null;
      continue;
    }
    const ol = /^(\d+)[.)]\s+(.*)$/.exec(line);
    if (ol) {
      blocks.push({ type: "ol", order: Number(ol[1]), content: ol[2] });
      olCounter = null;
      continue;
    }
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      blocks.push({ type: "quote", content: quote[1] });
      olCounter = null;
      continue;
    }
    const img = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/.exec(line);
    if (img) {
      blocks.push({ type: "image", src: img[2], alt: img[1] });
      olCounter = null;
      continue;
    }
    blocks.push({ type: "paragraph", content: line });
    if (olCounter === null) olCounter = 0;
    else olCounter++;
  }
  return blocks;
}

// ---------- 行内解析 ----------

interface MarkerRule {
  kind: "bold" | "italic" | "code" | "annotate";
  annotation?: AnnotationType;
}

/** 开标记 → 规则。三连标记 (multiline) 先匹配。 */
const MARKER_OPEN: Record<string, MarkerRule> = {
  "===": { kind: "annotate", annotation: "highlight" },
  "^^^": { kind: "annotate", annotation: "underline" },
  "[[[": { kind: "annotate", annotation: "box" },
  "(((": { kind: "annotate", annotation: "circle" },
  "~~~": { kind: "annotate", annotation: "strike-through" },
  "×××": { kind: "annotate", annotation: "crossed-off" },
  "⟦⟦": { kind: "annotate", annotation: "bracket" },
  "==": { kind: "annotate", annotation: "highlight" },
  "^^": { kind: "annotate", annotation: "underline" },
  "[[": { kind: "annotate", annotation: "box" },
  "((": { kind: "annotate", annotation: "circle" },
  "~~": { kind: "annotate", annotation: "strike-through" },
  "××": { kind: "annotate", annotation: "crossed-off" },
  "⟦": { kind: "annotate", annotation: "bracket" },
  "**": { kind: "bold" },
  "*": { kind: "italic" },
  "`": { kind: "code" },
};

/** 开标记 → 对应闭标记 (闭标记无二义性, 直接替换字符) */
function closeFor(open: string): string {
  switch (open) {
    case "===":
      return "===";
    case "^^^":
      return "^^^";
    case "[[[":
      return "]]]";
    case "(((":
      return ")))";
    case "~~~":
      return "~~~";
    case "×××":
      return "×××";
    case "⟦⟦":
      return "⟧⟧";
    case "==":
      return "==";
    case "^^":
      return "^^";
    case "[[":
      return "]]";
    case "((":
      return "))";
    case "~~":
      return "~~";
    case "××":
      return "××";
    case "⟦":
      return "⟧";
    case "**":
      return "**";
    case "*":
      return "*";
    case "`":
      return "`";
    default:
      return open;
  }
}

const OPEN_RE =
  /(===|\^\^\^|\[\[\[|\(\(\(|~~~|×××|⟦⟦|==|\^\^|\[\[|\(\(|~~|××|⟦|\*\*|\*|`|!\[|\[)/;

export function parseInline(src: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let pos = 0;
  while (pos < src.length) {
    const m = OPEN_RE.exec(src.slice(pos));
    if (!m) {
      tokens.push({ type: "text", text: src.slice(pos) });
      break;
    }
    const idx = pos + m.index;
    const open = m[1];
    if (idx > pos) tokens.push({ type: "text", text: src.slice(pos, idx) });

    // 链接 / 图片: [text](url) / ![alt](url)
    if (open === "[" || open === "![") {
      const rest = src.slice(idx);
      const link = rest.match(/^(\!?)\[([^\]]*)\]\(([^)\s]+)\)/);
      if (link) {
        const isImage = link[1] === "!";
        if (isImage) {
          tokens.push({ type: "image", src: link[3], alt: link[2] });
        } else {
          tokens.push({ type: "link", href: link[3], children: parseInline(link[2]) });
        }
        pos = idx + link[0].length;
        continue;
      }
      tokens.push({ type: "text", text: open });
      pos = idx + open.length;
      continue;
    }

    const rule = MARKER_OPEN[open];
    if (!rule) {
      tokens.push({ type: "text", text: open });
      pos = idx + open.length;
      continue;
    }
    const close = closeFor(open);
    const contentStart = idx + open.length;
    const closeIdx = src.indexOf(close, contentStart);
    if (closeIdx < 0) {
      // 未闭合 → 按纯文本处理
      tokens.push({ type: "text", text: open });
      pos = idx + open.length;
      continue;
    }
    const inner = src.slice(contentStart, closeIdx);
    const children = parseInline(inner);
    if (rule.kind === "bold") {
      tokens.push({ type: "bold", children });
    } else if (rule.kind === "italic") {
      tokens.push({ type: "italic", children });
    } else if (rule.kind === "code") {
      tokens.push({ type: "code", text: inner });
    } else {
      tokens.push({
        type: "annotate",
        annotation: rule.annotation!,
        multiline: open.length >= 3 || inner.includes("\n"),
        children,
      });
    }
    pos = closeIdx + close.length;
  }
  return tokens;
}

/** 从 token 流提取纯文本 (供注解重绘依赖) */
export function inlineText(tokens: InlineToken[]): string {
  let out = "";
  for (const t of tokens) {
    switch (t.type) {
      case "text":
        out += t.text;
        break;
      case "code":
        out += t.text;
        break;
      case "image":
        out += `![${t.alt}](${t.src})`;
        break;
      case "link":
        out += inlineText(t.children);
        break;
      case "bold":
      case "italic":
      case "annotate":
        out += inlineText(t.children);
        break;
    }
  }
  return out;
}

/** 从 markdown 中提取图片 URL (最多 3 张, 供卡片缩略图) */
export function extractImages(markdown: string): string[] {
  const urls: string[] = [];
  const re = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) && urls.length < 3) {
    urls.push(m[2]);
  }
  return urls;
}

// ---------- 注解标记工具 (编辑器使用) ----------

export interface AnnotationMarker {
  annotation: AnnotationType;
  open: string;
  close: string;
  multilineOpen: string;
  multilineClose: string;
}

export const ANNOTATION_MARKERS: AnnotationMarker[] = [
  { annotation: "underline", open: "^^", close: "^^", multilineOpen: "^^^", multilineClose: "^^^" },
  { annotation: "box", open: "[[", close: "]]", multilineOpen: "[[[", multilineClose: "]]]" },
  { annotation: "circle", open: "((", close: "))", multilineOpen: "(((", multilineClose: ")))" },
  { annotation: "highlight", open: "==", close: "==", multilineOpen: "===", multilineClose: "===" },
  { annotation: "strike-through", open: "~~", close: "~~", multilineOpen: "~~~", multilineClose: "~~~" },
  { annotation: "crossed-off", open: "××", close: "××", multilineOpen: "×××", multilineClose: "×××" },
  { annotation: "bracket", open: "⟦", close: "⟧", multilineOpen: "⟦⟦", multilineClose: "⟧⟧" },
];

export function findMarker(annotation: AnnotationType): AnnotationMarker {
  return ANNOTATION_MARKERS.find((m) => m.annotation === annotation)!;
}

/** 判断文本是否已被某注解标记包裹; 返回 { wrapped, multiline, inner } */
export function detectAnnotation(
  text: string,
  annotation: AnnotationType,
): { wrapped: boolean; multiline: boolean; inner: string } {
  const m = findMarker(annotation);
  // 先检测三连 (multiline) 标记, 再检测单标记 (三连同时满足单标记的前缀/后缀)
  if (
    text.startsWith(m.multilineOpen) &&
    text.endsWith(m.multilineClose) &&
    text.length > m.multilineOpen.length + m.multilineClose.length
  ) {
    return { wrapped: true, multiline: true, inner: text.slice(m.multilineOpen.length, -m.multilineClose.length) };
  }
  if (text.startsWith(m.open) && text.endsWith(m.close) && text.length > m.open.length + m.close.length) {
    return { wrapped: true, multiline: false, inner: text.slice(m.open.length, -m.close.length) };
  }
  return { wrapped: false, multiline: false, inner: text };
}

/** 对文本应用或取消注解标记; 返回新文本与包裹后选区范围 */
export function toggleAnnotation(
  text: string,
  annotation: AnnotationType,
  multiline = false,
): { text: string; multiline: boolean } {
  const m = findMarker(annotation);
  const det = detectAnnotation(text, annotation);
  if (det.wrapped) {
    return { text: det.inner, multiline: false };
  }
  const open = multiline ? m.multilineOpen : m.open;
  const close = multiline ? m.multilineClose : m.close;
  return { text: open + text + close, multiline };
}
