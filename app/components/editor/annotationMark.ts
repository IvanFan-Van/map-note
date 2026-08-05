import { Mark } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import type { Mark as PMMark } from "@tiptap/pm/model";
import type { AnnotationType } from "~/lib/markdown";
import { ANNOTATION_MARK_NAME } from "~/lib/tiptap";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    annotation: {
      /** 切换选区注解 (单行内; 已有同类型则移除, 不同类型则替换) */
      toggleAnnotation: (
        type: AnnotationType,
        color?: string | null,
      ) => ReturnType;
      /** 更新选区注解颜色 (无注解时返回 false) */
      setAnnotationColor: (color: string) => ReturnType;
    };
  }
}

export const AnnotationMark = Mark.create({
  name: ANNOTATION_MARK_NAME,

  addAttributes() {
    return {
      annotation: {
        default: "box",
        parseHTML: (el) => el.getAttribute("data-annotation") ?? "box",
        renderHTML: (attrs) => ({ "data-annotation": attrs.annotation }),
      },
      multiline: {
        default: false,
        parseHTML: (el) => el.hasAttribute("data-multiline"),
        renderHTML: (attrs) => (attrs.multiline ? { "data-multiline": "1" } : {}),
      },
      color: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-color") ?? null,
        renderHTML: (attrs) => (attrs.color ? { "data-color": attrs.color } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-annotation]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", HTMLAttributes, 0];
  },

  addCommands() {
    return {
      toggleAnnotation:
        (type, color = null) =>
        ({ commands, state }) => {
          const { from, to } = state.selection;
          if (from === to) return false;
          // 跨行选区不支持 (行块式模型)
          if (state.doc.resolve(from).start() !== state.doc.resolve(to).start()) {
            return false;
          }
          // 不用 $from.marks(): 选区起点恰为 mark 起点 (文本节点边界,
          // textOffset === 0) 时 marks() 只返回前一个节点的 marks, 检测不到
          // 已应用的注解; 与 TipTap isMarkActive 一致, 遍历选区内文本节点
          const existing = findAnnotationInSelection(state, from, to);
          if (existing) {
            if (existing.attrs.annotation === type) {
              commands.unsetMark(ANNOTATION_MARK_NAME);
              return true;
            }
            commands.unsetMark(ANNOTATION_MARK_NAME);
            commands.setMark(ANNOTATION_MARK_NAME, {
              annotation: type,
              multiline: false,
              color: color ?? existing.attrs.color ?? null,
            });
            return true;
          }
          commands.setMark(ANNOTATION_MARK_NAME, {
            annotation: type,
            multiline: false,
            color,
          });
          return true;
        },
      setAnnotationColor:
        (color) =>
        ({ commands, state }) => {
          const { from, to } = state.selection;
          const existing = findAnnotationInSelection(state, from, to);
          if (!existing) return false;
          commands.updateAttributes(ANNOTATION_MARK_NAME, { color });
          return true;
        },
    };
  },
});

/** 遍历选区内的文本节点查找 annotation mark (不受 $from.marks() 边界交集问题影响) */
function findAnnotationInSelection(state: EditorState, from: number, to: number): PMMark | null {
  let existing: PMMark | null = null;
  state.doc.nodesBetween(from, to, (node) => {
    if (!existing && node.isText) {
      const m = node.marks.find((mm) => mm.type.name === ANNOTATION_MARK_NAME);
      if (m) existing = m as PMMark;
    }
  });
  return existing;
}
