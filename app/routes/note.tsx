import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, redirect } from "react-router";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import ImageExt from "@tiptap/extension-image";
import { HexColorPicker } from "react-colorful";
import { AnnotationIcon } from "~/components/editor/AnnotationIcon";
import { AnnotationMark } from "~/components/editor/annotationMark";
import { useAnnotationRenderer } from "~/components/editor/annotationRenderer";
import { StickerPicker } from "~/components/ui/StickerPicker";
import { jsonApi } from "~/lib/api";
import {
  markdownToJSON,
  jsonToMarkdown,
  ANNOTATION_MARK_NAME,
} from "~/lib/tiptap";
import type { AnnotationType } from "~/lib/markdown";
import {
  META_ATTRS,
  metaAttrOf,
  metaDisplay,
  todayString,
  type MetaAttr,
} from "~/lib/meta";
import { getSessionUser } from "~/server/auth";
import { getBoardDetail, getNote } from "~/server/db";
import type { Route } from "./+types/note";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await getSessionUser(request, env);
  if (!user) {
    return redirect(
      `/auth/login?returnTo=/b/${params.boardId}/n/${params.noteId}`
    );
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

// ---------- 注解工具 ----------

const ANNOTATION_TOOLS: { id: AnnotationType | "multiline"; label: string }[] =
  [
    { id: "underline", label: "下划线" },
    { id: "box", label: "方框" },
    { id: "circle", label: "圆圈" },
    { id: "highlight", label: "高亮" },
    { id: "strike-through", label: "删除线" },
    { id: "crossed-off", label: "划掉" },
    { id: "bracket", label: "括号" },
    { id: "multiline", label: "多行" },
  ];

const DEFAULT_ANNOTATION_COLOR = "#3b82f6";

export default function NoteEditor({ loaderData }: Route.ComponentProps) {
  const { note: initialNote, board, isEditor } = loaderData;
  const [syncState, setSyncState] = useState<"saved" | "saving" | "error">("saved");
  const [uploading, setUploading] = useState(false);
  // 待用注解颜色: 选择颜色但当前选区无注解时暂存, 应用注解时使用
  const [annoColor, setAnnoColor] = useState<string | null>(null);
  const [swatchOpen, setSwatchOpen] = useState(false);
  // 颜色选择器受控值 (拖动实时预览, 松开鼠标才应用)
  const [pickerColor, setPickerColor] = useState(DEFAULT_ANNOTATION_COLOR);
  const [toolPage, setToolPage] = useState(0);
  const [stickerOpen, setStickerOpen] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(
    (md: string) => {
      setSyncState("saving");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void jsonApi(`/api/notes/${initialNote.id}`, "PATCH", { content: md })
          .then(() => setSyncState("saved"))
          .catch(() => setSyncState("error"));
      }, 400);
    },
    [initialNote.id]
  );

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  // ---------- 元属性 (Obsidian 式, 动态添加) ----------
  const [meta, setMeta] = useState<Record<string, string>>(initialNote.meta);
  // 当前正在编辑值的属性键 (null = 无); 新添加未选值的属性以空值占位
  const [editingMetaKey, setEditingMetaKey] = useState<string | null>(null);
  const [metaAddOpen, setMetaAddOpen] = useState(false);
  const [customKey, setCustomKey] = useState("");

  // 元属性修改低频, 即时保存 (无防抖); 空值占位会在服务端被忽略
  const saveMeta = useCallback(
    (next: Record<string, string>) => {
      setSyncState("saving");
      void jsonApi(`/api/notes/${initialNote.id}`, "PATCH", { meta: next })
        .then(() => setSyncState("saved"))
        .catch(() => setSyncState("error"));
    },
    [initialNote.id]
  );

  const applyMeta = useCallback(
    (key: string, value: string) => {
      setMeta((prev) => {
        const next = { ...prev };
        // 丢弃未提交的空值占位
        for (const [k, v] of Object.entries(next)) {
          if (v === "") delete next[k];
        }
        next[key] = value;
        saveMeta(next);
        return next;
      });
      setEditingMetaKey(null);
    },
    [saveMeta]
  );

  const removeMeta = useCallback(
    (key: string) => {
      setMeta((prev) => {
        const next = { ...prev };
        delete next[key];
        for (const [k, v] of Object.entries(next)) {
          if (v === "") delete next[k];
        }
        saveMeta(next);
        return next;
      });
      setEditingMetaKey(null);
    },
    [saveMeta]
  );

  // 取消未提交的新属性 (空值占位) 或放弃修改
  const cancelPendingMeta = useCallback(() => {
    setEditingMetaKey(null);
    setMeta((prev) => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(next)) {
        if (v === "") delete next[k];
      }
      return next;
    });
  }, []);

  const startAddMeta = useCallback(
    (attr: MetaAttr) => {
      // date 属性默认当天日期, 添加即保存; 其余类型以空值占位等用户选值
      setMeta((prev) => {
        const next = { ...prev, [attr.key]: attr.type === "date" ? todayString() : "" };
        if (attr.type === "date") saveMeta(next);
        return next;
      });
      setEditingMetaKey(attr.key);
      setMetaAddOpen(false);
    },
    [saveMeta]
  );

  const startAddCustom = useCallback(() => {
    const key = customKey.trim();
    if (!key || key.length > 16 || key in meta) return;
    setMeta((prev) => ({ ...prev, [key]: "" }));
    setCustomKey("");
    setEditingMetaKey(key);
    setMetaAddOpen(false);
  }, [customKey, meta]);

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
      content: initialNote.content
        .split("\n")
        .map((line) => markdownToJSON(line)),
    },
    onUpdate: ({ editor }) => save(jsonToMarkdown(editor.getJSON())),
  });

  const { containerRef, underlayRef, overlayRef } = useAnnotationRenderer(editor);

  // 订阅编辑器状态 (激活态/跨行/当前注解 attrs)
  const editorState = useEditorState({
    editor,
    selector: ({ editor }) => {
      if (!editor)
        return {
          activeTypes: {} as Record<string, boolean>,
          multilineActive: false,
          crossLine: false,
          annoAttrs: null as Record<string, unknown> | null,
        };
      const { from, to } = editor.state.selection;
      const crossLine =
        editor.state.doc.resolve(from).start() !==
        editor.state.doc.resolve(to).start();
      const activeTypes: Record<string, boolean> = {};
      for (const t of ANNOTATION_TOOLS) {
        if (t.id === "multiline") continue;
        activeTypes[t.id] = editor.isActive(ANNOTATION_MARK_NAME, {
          annotation: t.id,
        });
      }
      const multilineActive = !!editor.isActive(ANNOTATION_MARK_NAME, {
        multiline: true,
      });
      const annoAttrs =
        (editor.getAttributes(ANNOTATION_MARK_NAME) as Record<
          string,
          unknown
        >) ?? null;
      return { activeTypes, multilineActive, crossLine, annoAttrs };
    },
  });
  const { activeTypes, multilineActive, crossLine } = editorState ?? {
    activeTypes: {} as Record<string, boolean>,
    multilineActive: false,
    crossLine: false,
  };

  // 浮动工具栏分页
  const toolsPerPage = Math.max(
    1,
    Math.floor((typeof window !== "undefined" ? window.innerWidth : 600) / 52)
  );
  const toolPages = Math.ceil(ANNOTATION_TOOLS.length / toolsPerPage);
  const visibleTools = ANNOTATION_TOOLS.slice(
    toolPage * toolsPerPage,
    (toolPage + 1) * toolsPerPage
  );

  const applyTool = (id: AnnotationType | "multiline") => {
    if (!editor) return;
    if (id === "multiline") {
      const attrs = editor.getAttributes(ANNOTATION_MARK_NAME) as
        | { multiline?: boolean }
        | undefined;
      if (attrs && Object.keys(attrs).length > 0) {
        editor
          .chain()
          .focus()
          .updateAttributes(ANNOTATION_MARK_NAME, {
            multiline: !attrs.multiline,
          })
          .run();
      }
      return;
    }
    editor.chain().focus().toggleAnnotation(id, annoColor).run();
  };

  // 应用颜色: 选区已有注解 → 即时换色; 否则存为待用色
  const pickColor = (c: string) => {
    if (!editor) return;
    const applied = editor.chain().focus().setAnnotationColor(c).run();
    if (!applied) setAnnoColor(c);
  };

  // 打开色板: 初始值 = 选区注解色 ?? 待用色 ?? 默认
  const toggleSwatch = () => {
    if (!swatchOpen) {
      const current =
        (editor?.getAttributes(ANNOTATION_MARK_NAME) as { color?: string | null } | undefined)
          ?.color ??
        annoColor ??
        DEFAULT_ANNOTATION_COLOR;
      setPickerColor(current);
    }
    setSwatchOpen((v) => !v);
  };

  const uploadImage = async (file: File) => {
    if (!editor || !file.type.startsWith("image/")) return;
    setUploading(true);
    try {
      const dims = await new Promise<{ width: number; height: number }>(
        (resolve, reject) => {
          const img = new Image();
          img.onload = () =>
            resolve({ width: img.naturalWidth, height: img.naturalHeight });
          img.onerror = reject;
          img.src = URL.createObjectURL(file);
        }
      );
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
      if (!res.ok || !body.data?.image)
        throw new Error(body.error?.message ?? "上传失败");
      editor
        .chain()
        .focus()
        .insertContent({ type: "image", attrs: { src: body.data.image.url } })
        .run();
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
            editor
              ?.chain()
              .focus()
              .extendMarkRange("link")
              .setLink({ href: url })
              .run();
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
    [editor]
  );

  return (
    <div className="min-h-screen bg-board flex flex-col">
      <header className="flex items-center gap-3 px-4 py-2.5 bg-white/70 backdrop-blur shadow-sm sticky top-0 z-20">
        <Link to={`/b/${board.id}`} className="text-lg hover:text-warm/60">
          ←
        </Link>
        <h1 className="text-lg truncate">{board.name}</h1>
        <span
          className={`ml-auto text-sm ${
            syncState === "saved"
              ? "text-green-600"
              : syncState === "error"
                ? "text-red-500"
                : "text-warm/50"
          }`}
        >
          {syncState === "saved" ? "已保存" : syncState === "error" ? "保存失败" : "保存中…"}
        </span>
      </header>

      {/* 元属性 (Obsidian 式, 动态添加) + 格式工具栏 */}
      <section className="px-4 pt-3 flex flex-wrap items-center gap-2">
        {Object.entries(meta).map(([key, value]) => {
          const attr = metaAttrOf(key);
          const editing = editingMetaKey === key;
          return (
            <div
              key={key}
              className="flex items-center gap-1 rounded-xl bg-board/50 px-1.5 py-1 shadow-sm"
            >
              {/* 键块: 米色底 */}
              <span className="flex items-center gap-1 rounded-md bg-board/80 px-1.5 py-0.5 text-sm whitespace-nowrap">
                {attr ? attr.icon : "🏷"} {attr ? attr.label : key}
              </span>
              {editing ? (
                <MetaValueEditor
                  attr={
                    attr ?? {
                      key,
                      label: key,
                      icon: "🏷",
                      type: "text",
                      placeholder: "输入内容…",
                    }
                  }
                  value={value}
                  onPick={(v) => applyMeta(key, v)}
                  onCancel={cancelPendingMeta}
                />
              ) : (
                <>
                  {/* 值块: 白底 + 细边 */}
                  <button
                    disabled={!isEditor}
                    onClick={() => isEditor && setEditingMetaKey(key)}
                    className="rounded-md bg-white border border-warm/10 shadow-sm px-1.5 py-0.5 text-sm max-w-32 truncate hover:border-blue-300 disabled:cursor-default"
                    title={isEditor ? "点击修改" : undefined}
                  >
                    {metaDisplay(key, value)}
                  </button>
                  {isEditor && (
                    <button
                      onClick={() => removeMeta(key)}
                      className="text-xs text-warm/40 hover:text-red-500 px-0.5"
                      title="删除属性"
                    >
                      ✕
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}

        {isEditor && !metaAddOpen && (
          <button
            onClick={() => setMetaAddOpen(true)}
            className="rounded-xl bg-board/50 px-2.5 py-1 text-sm shadow-sm hover:bg-board/80 transition-colors"
          >
            + 属性
          </button>
        )}

        {isEditor && metaAddOpen && (
          <div className="flex items-center gap-1 rounded-xl bg-board/50 px-1.5 py-1 shadow-sm">
            {META_ATTRS.filter((a) => !(a.key in meta)).map((a) => (
              <button
                key={a.key}
                onClick={() => startAddMeta(a)}
                className="rounded-lg bg-board/60 px-2 py-1 text-sm hover:bg-board transition-colors"
              >
                {a.icon} {a.label}
              </button>
            ))}
            {META_ATTRS.every((a) => a.key in meta) && (
              <span className="text-xs text-warm/50 px-1">预设属性已全部添加</span>
            )}
            <input
              value={customKey}
              onChange={(e) => setCustomKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") startAddCustom();
                if (e.key === "Escape") setMetaAddOpen(false);
              }}
              maxLength={16}
              placeholder="自定义属性名"
              className="w-28 rounded-lg bg-board/60 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-blue-300"
            />
            <button
              onClick={() => setMetaAddOpen(false)}
              className="text-xs text-warm/40 hover:text-warm/70 px-0.5"
              title="关闭"
            >
              ✕
            </button>
          </div>
        )}

        <div className="flex items-center gap-1 ml-auto">
          {isEditor && (
            <button
              onClick={() => setStickerOpen(true)}
              disabled={!isEditor}
              title="插入表情"
              className="w-8 h-8 rounded-lg bg-white shadow-sm hover:bg-board text-sm flex items-center justify-center disabled:opacity-40 transition-colors"
            >
              😀
            </button>
          )}
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
        <p className="px-4 pt-2 text-sm text-warm/50">
          你是观看者, 无法编辑内容。
        </p>
      )}

      {/* 编辑器 */}
      <main className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
        <div className="max-w-2xl mx-auto bg-white/60 rounded-2xl p-5 min-h-full">
          {editor && (
            <div ref={containerRef} className="relative">
              {/* highlight 画在文本下层 (粗线贯穿文字, 上层会遮住字体) */}
              <svg
                ref={underlayRef}
                className="absolute inset-0 pointer-events-none"
                style={{ overflow: "visible" }}
                aria-hidden="true"
              />
              <EditorContent
                editor={editor}
                className="tiptap text-base leading-relaxed font-sans"
              />
              <svg
                ref={overlayRef}
                className="absolute inset-0 pointer-events-none"
                style={{ overflow: "visible" }}
                aria-hidden="true"
              />
            </div>
          )}
          {!editor && <div className="text-warm/40 text-sm">加载编辑器…</div>}
          {uploading && (
            <p className="mt-2 text-sm text-warm/50">图片上传中…</p>
          )}
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

      {/* 表情选择器 (GIPHY, 转存 R2 后插入为图片) */}
      {stickerOpen && (
        <StickerPicker
          boardId={board.id}
          onPick={(url) => {
            setStickerOpen(false);
            editor?.chain().focus().insertContent({ type: "image", attrs: { src: url } }).run();
          }}
          onClose={() => setStickerOpen(false)}
        />
      )}

      {/* 选中文本浮动工具栏 */}
      {editor && isEditor && (
        <BubbleMenu
          editor={editor}
          shouldShow={({ editor }) => !editor.state.selection.empty}
          appendTo={() => document.body}
          className="z-50"
        >
          <div className="flex items-center gap-0.5 rounded-xl bg-warm text-white shadow-xl px-1.5 py-1">
            {/* 颜色选择器 */}
            <div className="relative">
              <button
                onClick={toggleSwatch}
                className="w-9 h-8 rounded-lg flex items-center justify-center hover:bg-white/15"
                title="注解颜色"
              >
                <span
                  className="w-4 h-4 rounded-full border border-white/60"
                  style={{ backgroundColor: pickerColor }}
                />
              </button>
              {swatchOpen && (
                <div className="absolute bottom-9 left-0 z-10 rounded-xl bg-warm p-2 shadow-xl anno-swatch">
                  <HexColorPicker
                    color={pickerColor}
                    onChange={setPickerColor}
                    onMouseUp={() => pickColor(pickerColor)}
                    onTouchEnd={() => pickColor(pickerColor)}
                  />
                </div>
              )}
            </div>

            {visibleTools.map((t) => {
              const active =
                t.id === "multiline" ? multilineActive : activeTypes[t.id];
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
                  <AnnotationIcon
                    type={t.id}
                    color={active ? "#ffffff" : undefined}
                  />
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

function MetaValueEditor({
  attr,
  value,
  onPick,
  onCancel,
}: {
  attr: MetaAttr;
  value: string;
  onPick: (v: string) => void;
  onCancel: () => void;
}) {
  // 预设选项之外, 允许输入自定义值 (回车确认)
  const customInput = (
    <input
      autoFocus
      maxLength={50}
      placeholder="自定义…"
      className="w-20 rounded-lg bg-board/60 px-1.5 py-0.5 text-sm outline-none focus:ring-2 focus:ring-blue-300"
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          const v = e.currentTarget.value.trim();
          if (v) onPick(v);
        }
        if (e.key === "Escape") onCancel();
      }}
      onBlur={onCancel}
    />
  );
  if (attr.type === "select") {
    return (
      <span className="flex items-center gap-0.5">
        {attr.options!.map((o) => (
          <button
            key={o.value}
            onClick={() => onPick(o.value)}
            className={`rounded-lg px-1.5 py-0.5 text-sm transition-colors ${
              o.value === value
                ? "bg-blue-500 text-white"
                : "bg-board/60 hover:bg-board"
            }`}
          >
            {o.label}
          </button>
        ))}
        {customInput}
      </span>
    );
  }
  if (attr.type === "number") {
    const max = attr.max ?? 10;
    return (
      <span className="flex items-center gap-0.5">
        {Array.from({ length: max }, (_, i) => String(i + 1)).map((n) => (
          <button
            key={n}
            onClick={() => onPick(n)}
            className={`w-6 h-6 rounded-lg text-sm transition-colors ${
              n === value
                ? "bg-blue-500 text-white"
                : "bg-board/60 hover:bg-board"
            }`}
          >
            {n}
          </button>
        ))}
        {customInput}
      </span>
    );
  }
  if (attr.type === "date") {
    return (
      <input
        autoFocus
        type="date"
        defaultValue={value}
        className="rounded-lg bg-white border border-warm/10 shadow-sm px-1.5 py-0.5 text-sm outline-none focus:ring-2 focus:ring-blue-300"
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
        onChange={(e) => {
          if (e.target.value) onPick(e.target.value);
        }}
        onBlur={onCancel}
      />
    );
  }
  return (
    <input
      autoFocus
      defaultValue={value}
      maxLength={50}
      placeholder={attr.placeholder}
      className="w-36 rounded-lg bg-white border border-warm/10 shadow-sm px-2 py-0.5 text-sm outline-none focus:ring-2 focus:ring-blue-300"
      onKeyDown={(e) => {
        if (e.key === "Enter") onPick(e.currentTarget.value.trim());
        if (e.key === "Escape") onCancel();
      }}
      onBlur={onCancel}
    />
  );
}
