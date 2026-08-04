import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, redirect } from "react-router";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import ImageExt from "@tiptap/extension-image";
import { AnnotationIcon } from "~/components/editor/AnnotationIcon";
import { AnnotationMark } from "~/components/editor/annotationMark";
import { useAnnotationRenderer } from "~/components/editor/annotationRenderer";
import { jsonApi } from "~/lib/api";
import { markdownToJSON, jsonToMarkdown, ANNOTATION_MARK_NAME } from "~/lib/tiptap";
import type { AnnotationType } from "~/lib/markdown";
import { getSessionUser } from "~/server/auth";
import { getBoardDetail, getNote } from "~/server/db";
import type { Route } from "./+types/note";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await getSessionUser(request, env);
  if (!user) {
    return redirect(`/auth/login?returnTo=/b/${params.boardId}/n/${params.noteId}`);
  }
  const note = await getNote(env, params.noteId);
  if (!note) {
    throw new Response("便笺不存在", { status: 404 });
  }
  const board = await getBoardDetail(env, note.boardId, user.id);
  if (!board) {
    throw new Response("无权访问", { status: 403 });
  }
  return { note, board, isEditor: board.role === "editor" };
}

// ---------- 模板 (心情/天气/疲惫/进食) ----------

const MOOD_TEMPLATES = [
  { key: "happy", label: "😊 开心", template: "**心情** 😊 开心" },
  { key: "neutral", label: "😐 一般", template: "**心情** 😐 一般" },
  { key: "sad", label: "😔 低落", template: "**心情** 😔 低落" },
  { key: "angry", label: "😡 生气", template: "**心情** 😡 生气" },
  { key: "sleepy", label: "😴 困倦", template: "**心情** 😴 困倦" },
];

const WEATHER_TEMPLATES = [
  { key: "sunny", label: "☀️ 晴", template: "**天气** ☀️ 晴" },
  { key: "cloudy", label: "🌤 多云", template: "**天气** 🌤 多云" },
  { key: "rainy", label: "🌧 雨", template: "**天气** 🌧 雨" },
  { key: "snowy", label: "🌨 雪", template: "**天气** 🌨 雪" },
  { key: "stormy", label: "⛈ 雷暴", template: "**天气** ⛈ 雷暴" },
];

const FATIGUE_TEMPLATES = [1, 3, 5, 7, 9].map((n) => ({
  key: String(n),
  label: `⚡${n}`,
  template: `**疲惫** ⚡ ${n}/10`,
}));

const DIET_TEMPLATE = { key: "diet", label: "🍽 进食", template: "**进食** 🍽 " };

// ---------- 注解工具 ----------

const ANNOTATION_TOOLS: { id: AnnotationType | "multiline"; label: string }[] = [
  { id: "underline", label: "下划线" },
  { id: "box", label: "方框" },
  { id: "circle", label: "圆圈" },
  { id: "highlight", label: "高亮" },
  { id: "strike-through", label: "删除线" },
  { id: "crossed-off", label: "划掉" },
  { id: "bracket", label: "括号" },
  { id: "multiline", label: "多行" },
];

const ANNOTATION_COLORS = [
  "#3b82f6",
  "#dc2626",
  "#e11d48",
  "#f59e0b",
  "#22c55e",
  "#8b5cf6",
  "#ec4899",
  "#4a4238",
];

export default function NoteEditor({ loaderData }: Route.ComponentProps) {
  const { note: initialNote, board, isEditor } = loaderData;
  const [syncState, setSyncState] = useState<"saved" | "saving">("saved");
  const [uploading, setUploading] = useState(false);
  // 待用注解颜色: 选择颜色但当前选区无注解时暂存, 应用注解时使用
  const [annoColor, setAnnoColor] = useState<string | null>(null);
  const [swatchOpen, setSwatchOpen] = useState(false);
  const [toolPage, setToolPage] = useState(0);

  const fileRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(
    (md: string) => {
      setSyncState("saving");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void jsonApi(`/api/notes/${initialNote.id}`, "PATCH", { content: md })
          .then(() => setSyncState("saved"))
          .catch(() => setSyncState("saved"));
      }, 400);
    },
    [initialNote.id],
  );

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const editor = useEditor({
    immediatelyRender: false,
    editable: isEditor,
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      ImageExt.configure({ inline: true }),
      AnnotationMark,
    ],
    content: {
      type: "doc",
      content: initialNote.content.split("\n").map((line) => markdownToJSON(line)),
    },
    onUpdate: ({ editor }) => save(jsonToMarkdown(editor.getJSON())),
  });

  const { containerRef, overlayRef } = useAnnotationRenderer(editor);

  // 订阅编辑器状态 (激活态/跨行/当前注解 attrs)
  const editorState = useEditorState({
    editor,
    selector: ({ editor }) => {
      if (!editor) return { activeTypes: {} as Record<string, boolean>, multilineActive: false, crossLine: false, annoAttrs: null as Record<string, unknown> | null };
      const { from, to } = editor.state.selection;
      const crossLine = editor.state.doc.resolve(from).start() !== editor.state.doc.resolve(to).start();
      const activeTypes: Record<string, boolean> = {};
      for (const t of ANNOTATION_TOOLS) {
        if (t.id === "multiline") continue;
        activeTypes[t.id] = editor.isActive(ANNOTATION_MARK_NAME, { annotation: t.id });
      }
      const multilineActive = !!editor.isActive(ANNOTATION_MARK_NAME, { multiline: true });
      const annoAttrs = (editor.getAttributes(ANNOTATION_MARK_NAME) as Record<string, unknown>) ?? null;
      return { activeTypes, multilineActive, crossLine, annoAttrs };
    },
  });
  const { activeTypes, multilineActive, crossLine } = editorState ?? {
    activeTypes: {} as Record<string, boolean>,
    multilineActive: false,
    crossLine: false,
  };

  // 浮动工具栏分页
  const toolsPerPage = Math.max(1, Math.floor((typeof window !== "undefined" ? window.innerWidth : 600) / 52));
  const toolPages = Math.ceil(ANNOTATION_TOOLS.length / toolsPerPage);
  const visibleTools = ANNOTATION_TOOLS.slice(toolPage * toolsPerPage, (toolPage + 1) * toolsPerPage);

  const applyTool = (id: AnnotationType | "multiline") => {
    if (!editor) return;
    if (id === "multiline") {
      const attrs = editor.getAttributes(ANNOTATION_MARK_NAME) as { multiline?: boolean } | undefined;
      if (attrs && Object.keys(attrs).length > 0) {
        editor.chain().focus().updateAttributes(ANNOTATION_MARK_NAME, { multiline: !attrs.multiline }).run();
      }
      return;
    }
    editor.chain().focus().toggleAnnotation(id, annoColor).run();
  };

  const pickColor = (c: string) => {
    if (!editor) return;
    const applied = editor.chain().focus().setAnnotationColor(c).run();
    if (!applied) setAnnoColor(c);
    setSwatchOpen(false);
  };

  // 模板插入: 当前行空则替换, 否则新起一行
  const insertTemplate = (template: string) => {
    if (!editor) return;
    const node = markdownToJSON(template);
    const { state } = editor;
    const $from = state.doc.resolve(state.selection.from);
    const lineStart = $from.start();
    const lineEnd = $from.end();
    const lineText = state.doc.textBetween(lineStart, lineEnd);
    if (lineText.trim() === "") {
      editor.chain().focus().insertContentAt({ from: lineStart, to: lineEnd }, node).run();
    } else {
      editor.chain().focus().insertContentAt(lineEnd, node).run();
    }
  };

  const uploadImage = async (file: File) => {
    if (!editor || !file.type.startsWith("image/")) return;
    setUploading(true);
    try {
      const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
      });
      const form = new FormData();
      form.append("file", file);
      form.append("boardId", board.id);
      form.append("noteId", initialNote.id);
      form.append("width", String(dims.width));
      form.append("height", String(dims.height));
      const res = await fetch("/api/images", { method: "POST", body: form });
      const body = (await res.json()) as {
        ok?: boolean;
        data?: { image?: { url: string } };
        error?: { message?: string };
      };
      if (!res.ok || !body.data?.image) throw new Error(body.error?.message ?? "上传失败");
      editor.chain().focus().insertContent({ type: "image", attrs: { src: body.data.image.url } }).run();
    } catch (err) {
      alert(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  const formatTools = useMemo(
    () => [
      {
        label: "B",
        title: "加粗",
        active: () => !!editor?.isActive("bold"),
        fn: () => editor?.chain().focus().toggleBold().run(),
      },
      {
        label: "I",
        title: "斜体",
        active: () => !!editor?.isActive("italic"),
        fn: () => editor?.chain().focus().toggleItalic().run(),
      },
      {
        label: "H",
        title: "标题",
        active: () => !!editor?.isActive("heading", { level: 2 }),
        fn: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
      },
      {
        label: "•",
        title: "无序列表",
        active: () => !!editor?.isActive("bulletList"),
        fn: () => editor?.chain().focus().toggleBulletList().run(),
      },
      {
        label: "1.",
        title: "有序列表",
        active: () => !!editor?.isActive("orderedList"),
        fn: () => editor?.chain().focus().toggleOrderedList().run(),
      },
      {
        label: "🔗",
        title: "链接",
        active: () => !!editor?.isActive("link"),
        fn: () => {
          const url = window.prompt("链接地址 (留空取消):", "https://");
          if (url) {
            editor?.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
          }
        },
      },
      {
        label: "🖼",
        title: "插入图片",
        active: () => false,
        fn: () => fileRef.current?.click(),
      },
    ],
    [editor],
  );

  return (
    <div className="min-h-screen bg-board flex flex-col">
      <header className="flex items-center gap-3 px-4 py-2.5 bg-white/70 backdrop-blur shadow-sm sticky top-0 z-20">
        <Link to={`/b/${board.id}`} className="text-lg hover:text-warm/60">
          ←
        </Link>
        <h1 className="text-lg truncate">{board.name}</h1>
        <span
          className={`ml-auto text-sm ${syncState === "saved" ? "text-green-600" : "text-warm/50"}`}
        >
          {syncState === "saved" ? "已保存" : "保存中…"}
        </span>
      </header>

      {/* 快捷插入 (模板) + 格式工具栏 */}
      <section className="px-4 pt-3 flex flex-wrap items-center gap-2">
        <TemplateGroup label="心情">
          {MOOD_TEMPLATES.map((t) => (
            <TemplateButton key={t.key} label={t.label} disabled={!isEditor} onClick={() => insertTemplate(t.template)} />
          ))}
        </TemplateGroup>
        <TemplateGroup label="天气">
          {WEATHER_TEMPLATES.map((t) => (
            <TemplateButton key={t.key} label={t.label} disabled={!isEditor} onClick={() => insertTemplate(t.template)} />
          ))}
        </TemplateGroup>
        <TemplateGroup label="疲惫">
          {FATIGUE_TEMPLATES.map((t) => (
            <TemplateButton key={t.key} label={t.label} disabled={!isEditor} onClick={() => insertTemplate(t.template)} />
          ))}
        </TemplateGroup>
        <TemplateGroup label="进食">
          <TemplateButton label={DIET_TEMPLATE.label} disabled={!isEditor} onClick={() => insertTemplate(DIET_TEMPLATE.template)} />
        </TemplateGroup>
        <div className="flex items-center gap-1 ml-auto">
          {formatTools.map((t) => (
            <button
              key={t.title}
              onClick={t.fn}
              disabled={!isEditor}
              title={t.title}
              className={`w-8 h-8 rounded-lg bg-white shadow-sm hover:bg-board text-sm font-semibold flex items-center justify-center disabled:opacity-40 transition-colors ${
                t.active() ? "bg-blue-500 text-white" : ""
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      {!isEditor && (
        <p className="px-4 pt-2 text-sm text-warm/50">你是观看者, 无法编辑内容。</p>
      )}

      {/* 编辑器 */}
      <main className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
        <div className="max-w-2xl mx-auto bg-white/60 rounded-2xl p-5 min-h-full">
          {editor && (
            <div ref={containerRef} className="relative">
              <EditorContent editor={editor} className="tiptap text-base leading-relaxed font-sans" />
              <svg
                ref={overlayRef}
                className="absolute inset-0 pointer-events-none"
                style={{ overflow: "visible" }}
                aria-hidden="true"
              />
            </div>
          )}
          {!editor && <div className="text-warm/40 text-sm">加载编辑器…</div>}
          {uploading && <p className="mt-2 text-sm text-warm/50">图片上传中…</p>}
        </div>
      </main>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void uploadImage(f);
          e.target.value = "";
        }}
      />

      {/* 选中文本浮动工具栏 */}
      {editor && isEditor && (
        <BubbleMenu
          editor={editor}
          shouldShow={({ editor }) => !editor.state.selection.empty}
        >
          <div className="flex items-center gap-0.5 rounded-xl bg-warm text-white shadow-xl px-1.5 py-1">
            {/* 颜色选择器 */}
            <div className="relative">
              <button
                onClick={() => setSwatchOpen((v) => !v)}
                className="w-9 h-8 rounded-lg flex items-center justify-center hover:bg-white/15"
                title="注解颜色"
              >
                <span
                  className="w-4 h-4 rounded-full border border-white/60"
                  style={{ backgroundColor: annoColor ?? "#ffffff" }}
                />
              </button>
              {swatchOpen && (
                <div className="absolute bottom-9 left-0 z-10 grid grid-cols-4 gap-1.5 rounded-xl bg-warm p-2 shadow-xl">
                  {ANNOTATION_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => pickColor(c)}
                      className="w-6 h-6 rounded-full hover:scale-110 transition-transform"
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  ))}
                </div>
              )}
            </div>

            {visibleTools.map((t) => {
              const active = t.id === "multiline" ? multilineActive : activeTypes[t.id];
              return (
                <button
                  key={t.id}
                  title={t.label}
                  disabled={crossLine}
                  onClick={() => applyTool(t.id)}
                  className={`w-9 h-8 rounded-lg flex items-center justify-center transition-colors disabled:opacity-30 ${
                    active ? "bg-blue-500" : "hover:bg-white/15"
                  }`}
                >
                  <AnnotationIcon type={t.id} color={active ? "#ffffff" : undefined} />
                </button>
              );
            })}
            {toolPages > 1 && (
              <button
                title="下一页"
                onClick={() => setToolPage((p) => (p + 1) % toolPages)}
                className="w-9 h-8 rounded-lg text-sm flex items-center justify-center hover:bg-white/15"
              >
                {toolPage < toolPages - 1 ? "›" : "‹"}
              </button>
            )}
          </div>
        </BubbleMenu>
      )}
    </div>
  );
}

function TemplateGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1 rounded-xl bg-white/70 px-2 py-1 shadow-sm">
      <span className="text-xs text-warm/50 mr-1">{label}</span>
      {children}
    </div>
  );
}

function TemplateButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg bg-board/60 px-2 py-1 text-sm hover:bg-board disabled:opacity-40 transition-colors"
    >
      {label}
    </button>
  );
}
