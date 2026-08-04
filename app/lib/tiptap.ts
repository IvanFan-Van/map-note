/**
 * 自研标记语法 ↔ TipTap JSON 双向转换器。
 *
 * 内容模型: 每 block = 一行 (与行块式一致)。便笺存储格式仍为标记字符串,
 * 编辑器内部使用 TipTap JSON, 保存时导出回标记字符串。
 */
import type { JSONContent } from "@tiptap/core";
import {
  findMarker,
  parseBlocks,
  parseInline,
  type AnnotationType,
  type Block,
  type InlineToken,
} from "~/lib/markdown";

/** 注解 mark 的 attrs (与 editor/annotationMark.ts 保持一致) */
export interface AnnotationAttrs {
  annotation: AnnotationType;
  multiline?: boolean;
  color?: string;
}

export const ANNOTATION_MARK_NAME = "annotation";

// ---------- 导入: 标记字符串 → TipTap JSON ----------

export function markdownToJSON(line: string): JSONContent {
  const [block] = parseBlocks(line);
  return blockToNode(block ?? { type: "paragraph", content: line });
}

function blockToNode(block: Block): JSONContent {
  switch (block.type) {
    case "title":
      return {
        type: "heading",
        attrs: { level: block.level },
        content: tokensToContent(parseInline(block.content)),
      };
    case "ul":
      return {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: tokensToContent(parseInline(block.content)),
              },
            ],
          },
        ],
      };
    case "ol":
      return {
        type: "orderedList",
        attrs: { start: block.order },
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: tokensToContent(parseInline(block.content)),
              },
            ],
          },
        ],
      };
    case "quote":
      return {
        type: "blockquote",
        content: [
          {
            type: "paragraph",
            content: tokensToContent(parseInline(block.content)),
          },
        ],
      };
    case "image":
      return { type: "image", attrs: { src: block.src, alt: block.alt ?? "" } };
    case "empty":
      return { type: "paragraph" };
    case "paragraph":
    default:
      return { type: "paragraph", content: tokensToContent(parseInline(block.content)) };
  }
}

function tokensToContent(tokens: InlineToken[]): JSONContent[] {
  const out: JSONContent[] = [];
  for (const t of tokens) {
    switch (t.type) {
      case "text":
        out.push({ type: "text", text: t.text });
        break;
      case "code":
        out.push({ type: "text", text: t.text, marks: [{ type: "code" }] });
        break;
      case "image":
        out.push({ type: "image", attrs: { src: t.src, alt: t.alt ?? "" } });
        break;
      case "bold":
        out.push(...wrapChildren("bold", t.children));
        break;
      case "italic":
        out.push(...wrapChildren("italic", t.children));
        break;
      case "link":
        out.push(...wrapChildren("link", t.children, { href: t.href }));
        break;
      case "annotate":
        out.push(
          ...wrapChildren(ANNOTATION_MARK_NAME, t.children, {
            annotation: t.annotation,
            multiline: t.multiline ?? false,
            color: t.color,
          }),
        );
        break;
    }
  }
  return out;
}

/** 把子 token 展开为携带指定 mark 的文本节点数组 */
function wrapChildren(
  markType: string,
  children: InlineToken[],
  attrs?: Record<string, unknown>,
): JSONContent[] {
  const inner = tokensToContent(children);
  if (inner.length === 0) {
    return [{ type: "text", text: "", marks: [{ type: markType, attrs }] }];
  }
  return inner.map((c) => ({
    ...c,
    marks: [...(c.marks ?? []), { type: markType, attrs }],
  }));
}

// ---------- 导出: TipTap JSON → 标记字符串 ----------

export function jsonToMarkdown(doc: JSONContent): string {
  const lines: string[] = [];
  for (const node of doc.content ?? []) lines.push(nodeToLine(node));
  return lines.join("\n");
}

function nodeToLine(node: JSONContent): string {
  switch (node.type) {
    case "heading":
      return `${"#".repeat((node.attrs?.level as number) ?? 1)} ${inlineJSON(node.content ?? [])}`;
    case "bulletList":
      return `- ${itemText(node)}`;
    case "orderedList":
      return `${(node.attrs?.start as number) ?? 1}. ${itemText(node)}`;
    case "blockquote":
      return `> ${inlineJSON(node.content ?? [])}`;
    case "image":
      return `![${node.attrs?.alt ?? ""}](${node.attrs?.src ?? ""})`;
    case "paragraph":
    default:
      return inlineJSON(node.content ?? []);
  }
}

function itemText(list: JSONContent): string {
  const item = list.content?.[0];
  const para = item?.content?.[0];
  return inlineJSON(para?.content ?? []);
}

/** 行内节点序列 → 标记字符串 (递归包装 marks) */
function inlineJSON(nodes: JSONContent[]): string {
  let out = "";
  for (const node of nodes) {
    if (node.type === "image") {
      out += `![${node.attrs?.alt ?? ""}](${node.attrs?.src ?? ""})`;
      continue;
    }
    const text = node.type === "text" ? (node.text ?? "") : inlineJSON(node.content ?? []);
    out += wrapMarks(text, node.marks ?? []);
  }
  return out;
}

/** 按 marks 数组顺序从内向外包装 (marks[0] 最内层) */
function wrapMarks(text: string, marks: NonNullable<JSONContent["marks"]>): string {
  let out = text;
  for (const mark of marks) {
    switch (mark.type) {
      case "bold":
        out = `**${out}**`;
        break;
      case "italic":
        out = `*${out}*`;
        break;
      case "code":
        out = `\`${out}\``;
        break;
      case "link":
        out = `[${out}](${mark.attrs?.href ?? ""})`;
        break;
      case ANNOTATION_MARK_NAME: {
        const attrs = mark.attrs as AnnotationAttrs | undefined;
        const m = findMarker(attrs?.annotation ?? "box");
        const open = attrs?.multiline ? m.multilineOpen : m.open;
        const close = attrs?.multiline ? m.multilineClose : m.close;
        const color = attrs?.color ? `#${attrs.color.replace(/^#/, "")}|` : "";
        out = `${open}${color}${out}${close}`;
        break;
      }
    }
  }
  return out;
}
