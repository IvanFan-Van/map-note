import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, redirect } from "react-router";
import { AnnotationIcon } from "~/components/editor/AnnotationIcon";
import { Markdown } from "~/components/markdown/Markdown";
import { jsonApi } from "~/lib/api";
import {
  detectAnnotation,
  findMarker,
  toggleAnnotation,
  type AnnotationType,
} from "~/lib/markdown";
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

// ---------- 选中文本浮动工具栏 ----------

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

interface FloatToolState {
  left: number;
  top: number;
  start: number;
  end: number;
  text: string;
}

function computeFloatPos(el: HTMLTextAreaElement): { left: number; top: number } | null {
  const { selectionStart, selectionEnd } = el;
  if (selectionEnd <= selectionStart) return null;
  const mirror: HTMLDivElement = document.createElement("div");
  const style = window.getComputedStyle(el);
  const props = [
    "fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight",
    "letterSpacing", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
    "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
    "boxSizing", "wordSpacing", "textTransform", "textIndent", "whiteSpace", "wordWrap",
  ] as const;
  for (const p of props) (mirror.style as unknown as Record<string, string>)[p] = style[p];
  // mirror 与 textarea 同位置对齐, 子 span 的视口坐标即选区坐标
  const taRect = el.getBoundingClientRect();
  mirror.style.position = "absolute";
  mirror.style.top = `${taRect.top}px`;
  mirror.style.left = `${taRect.left}px`;
  mirror.style.visibility = "hidden";
  mirror.style.width = `${el.clientWidth}px`;
  const spanA = document.createElement("span");
  spanA.textContent = el.value.slice(0, selectionStart);
  const spanB = document.createElement("span");
  spanB.textContent = el.value.slice(selectionStart, selectionEnd);
  mirror.appendChild(spanA);
  mirror.appendChild(spanB);
  document.body.appendChild(mirror);
  const rectA = spanA.getBoundingClientRect();
  const rectB = spanB.getBoundingClientRect();
  document.body.removeChild(mirror);
  const left = (rectA.left + rectB.right) / 2;
  const top = rectA.top - 10;
  // textarea 若滚动, 内容坐标需减去滚动偏移
  return { left: left - el.scrollLeft, top: top - el.scrollTop };
}

// ---------- 编辑器 ----------

export default function NoteEditor({ loaderData }: Route.ComponentProps) {
  const { note: initialNote, board, isEditor } = loaderData;
  const [content, setContent] = useState(initialNote.content);
  const [syncState, setSyncState] = useState<"saved" | "saving">("saved");
  const [uploading, setUploading] = useState(false);

  // 行块编辑状态
  const lines = useMemo(() => content.split("\n"), [content]);
  const [activeLine, setActiveLine] = useState(0);
  const [caretTarget, setCaretTarget] = useState<"start" | "end" | null>(null);
  const textareaRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const composingRef = useRef(false);

  // 浮动工具栏状态
  const [floatTool, setFloatTool] = useState<FloatToolState | null>(null);
  const [toolPage, setToolPage] = useState(0);

  const fileRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(
    (next: string) => {
      setSyncState("saving");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void jsonApi(`/api/notes/${initialNote.id}`, "PATCH", { content: next })
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

  const onContentChange = useCallback(
    (next: string) => {
      setContent(next);
      save(next);
    },
    [save],
  );

  const updateLine = useCallback(
    (index: number, value: string) => {
      const next = [...lines];
      next[index] = value;
      onContentChange(next.join("\n"));
    },
    [lines, onContentChange],
  );

  // 活动行切换后聚焦定位
  useEffect(() => {
    const el = textareaRefs.current[activeLine];
    if (!el) return;
    el.focus();
    const pos = caretTarget === "start" ? 0 : el.value.length;
    el.setSelectionRange(pos, pos);
    setCaretTarget(null);
  }, [activeLine, caretTarget]);

  const moveTo = (index: number, target: "start" | "end") => {
    if (index < 0 || index >= lines.length) return;
    setActiveLine(index);
    setCaretTarget(target);
    setFloatTool(null);
  };

  const handleLineKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || composingRef.current) return;
    if (e.key === "Enter") {
      e.preventDefault();
      const el = textareaRefs.current[activeLine];
      const caret = el?.selectionStart ?? 0;
      const before = lines[activeLine].slice(0, caret);
      const after = lines[activeLine].slice(caret);
      const next = [...lines];
      next[activeLine] = before;
      next.splice(activeLine + 1, 0, after);
      onContentChange(next.join("\n"));
      setActiveLine(activeLine + 1);
      setCaretTarget("start");
      setFloatTool(null);
      return;
    }
    if (e.key === "Backspace") {
      const el = textareaRefs.current[activeLine];
      const caret = el?.selectionStart ?? 0;
      // 行首 Backspace → 合并到上一行 (空行则直接删除)
      if (caret === 0 && activeLine > 0) {
        e.preventDefault();
        const next = [...lines];
        next[activeLine - 1] = lines[activeLine - 1] + lines[activeLine];
        next.splice(activeLine, 1);
        onContentChange(next.join("\n"));
        setActiveLine(activeLine - 1);
        setCaretTarget("end");
        setFloatTool(null);
      }
      return;
    }
    if (e.key === "Delete") {
      const el = textareaRefs.current[activeLine];
      const caret = el?.selectionStart ?? 0;
      // 行尾 Delete → 与下一行合并
      if (caret === (el?.value.length ?? 0) && activeLine < lines.length - 1) {
        e.preventDefault();
        const next = [...lines];
        next[activeLine] = lines[activeLine] + lines[activeLine + 1];
        next.splice(activeLine + 1, 1);
        onContentChange(next.join("\n"));
        setCaretTarget("end");
        setFloatTool(null);
      }
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      moveTo(activeLine - 1, "end");
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveTo(activeLine + 1, "end");
    }
  };

  // 选区变化 → 浮动工具栏
  const updateFloatTool = () => {
    const el = textareaRefs.current[activeLine];
    if (!el || !isEditor) return;
    const { selectionStart, selectionEnd } = el;
    if (selectionEnd <= selectionStart) {
      setFloatTool(null);
      return;
    }
    const pos = computeFloatPos(el);
    if (!pos) return;
    setFloatTool({
      left: pos.left,
      top: pos.top,
      start: selectionStart,
      end: selectionEnd,
      text: el.value.slice(selectionStart, selectionEnd),
    });
    setToolPage(0);
  };

  // 浮动工具栏分页
  const toolsPerPage = Math.max(1, Math.floor((typeof window !== "undefined" ? window.innerWidth : 600) / 52));
  const toolPages = Math.ceil(ANNOTATION_TOOLS.length / toolsPerPage);
  const visibleTools = ANNOTATION_TOOLS.slice(toolPage * toolsPerPage, (toolPage + 1) * toolsPerPage);

  // 应用/取消注解
  const applyTool = (id: AnnotationType | "multiline") => {
    if (!floatTool) return;
    if (id === "multiline") return; // multiline 是渲染增强, 直接切换三连标记由 toggleAnnotation 处理
    const line = lines[activeLine];
    const selText = line.slice(floatTool.start, floatTool.end);
    const marker = findMarker(id);
    const det = detectAnnotation(selText, id);
    let nextText: string;
    let nextStart = floatTool.start;
    let nextEnd: number;
    if (det.wrapped) {
      nextText = line.slice(0, floatTool.start) + det.inner + line.slice(floatTool.end);
      nextEnd = floatTool.start + det.inner.length;
    } else {
      const wrapped = marker.open + selText + marker.close;
      nextText = line.slice(0, floatTool.start) + wrapped + line.slice(floatTool.end);
      nextEnd = floatTool.start + wrapped.length;
    }
    updateLine(activeLine, nextText);
    setFloatTool({ ...floatTool, text: line.slice(nextStart, nextEnd), start: nextStart, end: nextEnd });
  };

  const applyMultiline = () => {
    if (!floatTool) return;
    const line = lines[activeLine];
    const selText = line.slice(floatTool.start, floatTool.end);
    // 检测选区是否被任一注解标记包裹
    for (const marker of ANNOTATION_TOOLS.slice(0, 7)) {
      const id = marker.id as AnnotationType;
      const det = detectAnnotation(selText, id);
      if (det.wrapped) {
        const m = findMarker(id);
        let inner = det.inner;
        const wrapped = (det.multiline ? m.open : m.multilineOpen) + inner + (det.multiline ? m.close : m.multilineClose);
        const nextText = line.slice(0, floatTool.start) + wrapped + line.slice(floatTool.end);
        updateLine(activeLine, nextText);
        setFloatTool({ ...floatTool, text: wrapped, start: floatTool.start, end: floatTool.start + wrapped.length });
        return;
      }
    }
  };

  const isToolActive = (id: AnnotationType | "multiline") => {
    if (!floatTool) return false;
    if (id === "multiline") {
      for (const marker of ANNOTATION_TOOLS.slice(0, 7)) {
        const det = detectAnnotation(floatTool.text, marker.id as AnnotationType);
        if (det.wrapped && det.multiline) return true;
      }
      return false;
    }
    return detectAnnotation(floatTool.text, id).wrapped;
  };

  // 行内插入 (顶部工具栏与模板)
  const insertAtCaret = (insert: string) => {
    const el = textareaRefs.current[activeLine];
    if (!el) return;
    const caret = el.selectionStart ?? lines[activeLine].length;
    const next = lines[activeLine].slice(0, caret) + insert + lines[activeLine].slice(caret);
    updateLine(activeLine, next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = caret + insert.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const insertTemplate = (template: string) => {
    const el = textareaRefs.current[activeLine];
    if (!el) return;
    const caret = el.selectionStart ?? lines[activeLine].length;
    const atLineEnd = caret >= lines[activeLine].length;
    const insert = atLineEnd ? template : ` ${template}`;
    insertAtCaret(insert);
  };

  const uploadImage = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
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
      insertAtCaret(`![图片](${body.data.image.url})`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  const formatTools = [
    { label: "B", title: "加粗", fn: () => insertAtCaret("**") },
    { label: "I", title: "斜体", fn: () => insertAtCaret("*") },
    { label: "H", title: "标题", fn: () => insertAtCaret("# ") },
    { label: "•", title: "无序列表", fn: () => insertAtCaret("- ") },
    { label: "1.", title: "有序列表", fn: () => insertAtCaret("1. ") },
    { label: "🔗", title: "链接", fn: () => insertAtCaret("[]()") },
    { label: "🖼", title: "插入图片", fn: () => fileRef.current?.click() },
  ];

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
              className="w-8 h-8 rounded-lg bg-white shadow-sm hover:bg-board text-sm font-semibold flex items-center justify-center disabled:opacity-40"
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      {!isEditor && (
        <p className="px-4 pt-2 text-sm text-warm/50">你是观看者, 无法编辑内容。</p>
      )}

      {/* 行块编辑器 (占满窗口) */}
      <main
        className="flex-1 min-h-0 overflow-y-auto px-4 py-4"
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) setFloatTool(null);
        }}
      >
        <div className="max-w-2xl mx-auto bg-white/60 rounded-2xl p-5 min-h-full">
          {lines.map((line, i) =>
            i === activeLine && isEditor ? (
              <textarea
                key={i}
                ref={(el) => {
                  textareaRefs.current[i] = el;
                }}
                value={line}
                rows={1}
                disabled={!isEditor}
                onChange={(e) => updateLine(i, e.target.value)}
                onKeyDown={handleLineKeyDown}
                onCompositionStart={() => (composingRef.current = true)}
                onCompositionEnd={() => {
                  composingRef.current = false;
                }}
                onSelect={updateFloatTool}
                onMouseUp={updateFloatTool}
                onKeyUp={updateFloatTool}
                placeholder="用 Markdown 记录此刻… 输入 # 标题, - 列表, 选中文本添加注解"
                className="block w-full bg-transparent outline-none resize-none text-base leading-relaxed font-sans py-0.5 min-h-[1.5em]"
                style={{ height: "auto", minHeight: "1.5em", fieldSizing: "content" }}
              />
            ) : (
              <div
                key={i}
                onClick={() => {
                  if (!isEditor) return;
                  moveTo(i, "end");
                }}
                className="cursor-text py-0.5 min-h-[1.5em]"
              >
                <Markdown text={line} />
              </div>
            ),
          )}
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
          {uploading && <p className="mt-2 text-sm text-warm/50">图片上传中…</p>}
        </div>
      </main>

      {/* 选中文本浮动工具栏 */}
      {floatTool && isEditor && (
        <div
          className="fixed z-50 flex items-center gap-0.5 rounded-xl bg-warm text-white shadow-xl px-1.5 py-1"
          style={{
            left: floatTool.left,
            top: floatTool.top,
            transform: "translateX(-50%) translateY(-100%)",
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {visibleTools.map((t) => (
            <button
              key={t.id}
              title={t.label}
              onClick={() => {
                if (t.id === "multiline") applyMultiline();
                else applyTool(t.id);
              }}
              className={`w-9 h-8 rounded-lg flex items-center justify-center transition-colors ${
                isToolActive(t.id) ? "bg-blue-500" : "hover:bg-white/15"
              }`}
            >
              <AnnotationIcon type={t.id} color={isToolActive(t.id) ? "#ffffff" : undefined} />
            </button>
          ))}
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
