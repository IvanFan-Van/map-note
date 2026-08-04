import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, redirect } from "react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { jsonApi } from "~/lib/api";
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

const MOODS: { key: string; label: string; icon: string }[] = [
  { key: "happy", label: "开心", icon: "😊" },
  { key: "neutral", label: "一般", icon: "😐" },
  { key: "sad", label: "低落", icon: "😔" },
  { key: "angry", label: "生气", icon: "😡" },
  { key: "sleepy", label: "困倦", icon: "😴" },
];

const WEATHERS: { key: string; label: string; icon: string }[] = [
  { key: "sunny", label: "晴", icon: "☀️" },
  { key: "cloudy", label: "多云", icon: "🌤" },
  { key: "rainy", label: "雨", icon: "🌧" },
  { key: "snowy", label: "雪", icon: "🌨" },
  { key: "stormy", label: "雷暴", icon: "⛈" },
];

export default function NoteEditor({ loaderData }: Route.ComponentProps) {
  const { note: initialNote, board, isEditor } = loaderData;
  const [content, setContent] = useState(initialNote.content);
  const [mood, setMood] = useState<string | null>(initialNote.mood);
  const [weather, setWeather] = useState<string | null>(initialNote.weather);
  const [fatigue, setFatigue] = useState<number | null>(initialNote.fatigue);
  const [diet, setDiet] = useState<string>(initialNote.diet ?? "");
  const [syncState, setSyncState] = useState<"saved" | "saving">("saved");
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(
    (updates: Record<string, unknown>) => {
      setSyncState("saving");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void jsonApi(`/api/notes/${initialNote.id}`, "PATCH", updates)
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

  const onContentChange = (v: string) => {
    setContent(v);
    save({ content: v });
  };

  const insertAtCursor = (before: string, after = "") => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = content.slice(start, end);
    const next =
      content.slice(0, start) + before + selected + after + content.slice(end);
    onContentChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = start + before.length;
      el.selectionEnd = start + before.length + selected.length;
    });
  };

  const uploadImage = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setUploading(true);
    try {
      const dims = await new Promise<{ width: number; height: number }>(
        (resolve, reject) => {
          const img = new Image();
          img.onload = () =>
            resolve({ width: img.naturalWidth, height: img.naturalHeight });
          img.onerror = reject;
          img.src = URL.createObjectURL(file);
        },
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
      if (!res.ok || !body.data?.image) {
        throw new Error(body.error?.message ?? "上传失败");
      }
      const md = `\n\n![图片](${body.data.image.url})\n`;
      onContentChange(content + md);
    } catch (err) {
      alert(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  const preview = useMemo(
    () => (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer" className="text-blue-600 underline break-all">
              {children}
            </a>
          ),
          img: ({ src, alt }) => (
            <img src={src} alt={alt ?? ""} className="max-w-full rounded-lg my-2 shadow-md" />
          ),
          h1: ({ children }) => <h1 className="text-2xl font-bold mt-4 mb-2">{children}</h1>,
          h2: ({ children }) => <h2 className="text-xl font-bold mt-3 mb-2">{children}</h2>,
          h3: ({ children }) => <h3 className="text-lg font-bold mt-3 mb-1">{children}</h3>,
          p: ({ children }) => <p className="my-2 leading-relaxed">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-6 my-2">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-6 my-2">{children}</ol>,
          li: ({ children }) => <li className="my-0.5">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-warm/30 pl-3 italic my-2 text-warm/80">
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code className="bg-warm/10 rounded px-1 py-0.5 text-sm">{children}</code>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    ),
    [content],
  );

  const toolbar = [
    { label: "B", title: "加粗", fn: () => insertAtCursor("**", "**") },
    { label: "I", title: "斜体", fn: () => insertAtCursor("*", "*") },
    { label: "H", title: "标题", fn: () => insertAtCursor("## ", "") },
    { label: "•", title: "无序列表", fn: () => insertAtCursor("- ", "") },
    { label: "1.", title: "有序列表", fn: () => insertAtCursor("1. ", "") },
    { label: "🔗", title: "链接", fn: () => insertAtCursor("[", "](https://)") },
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
          className={`ml-auto text-sm ${
            syncState === "saved" ? "text-green-600" : "text-warm/50"
          }`}
        >
          {syncState === "saved" ? "已保存" : "保存中…"}
        </span>
      </header>

      {/* 快捷状态栏 */}
      <section className="px-4 pt-3 flex flex-wrap gap-3">
        <QuickStatusGroup title="心情">
          <div className="flex gap-1.5">
            {MOODS.map((m) => (
              <button
                key={m.key}
                disabled={!isEditor}
                onClick={() => {
                  const v = mood === m.key ? null : m.key;
                  setMood(v);
                  save({ mood: v });
                }}
                title={m.label}
                className={`text-xl w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                  mood === m.key ? "bg-warm text-white" : "bg-white hover:bg-board"
                }`}
              >
                {m.icon}
              </button>
            ))}
          </div>
        </QuickStatusGroup>

        <QuickStatusGroup title="天气">
          <div className="flex gap-1.5">
            {WEATHERS.map((w) => (
              <button
                key={w.key}
                disabled={!isEditor}
                onClick={() => {
                  const v = weather === w.key ? null : w.key;
                  setWeather(v);
                  save({ weather: v });
                }}
                title={w.label}
                className={`text-xl w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                  weather === w.key ? "bg-warm text-white" : "bg-white hover:bg-board"
                }`}
              >
                {w.icon}
              </button>
            ))}
          </div>
        </QuickStatusGroup>

        <QuickStatusGroup title={`疲惫 ${fatigue ?? "–"} / 10`}>
          <div className="flex items-center gap-2 px-2">
            <input
              type="range"
              min={0}
              max={10}
              value={fatigue ?? 0}
              disabled={!isEditor}
              onChange={(e) => {
                const v = Number(e.target.value);
                setFatigue(v);
                save({ fatigue: v });
              }}
              className="w-32 accent-red-500"
            />
            <span className="text-lg w-6 text-center">{fatigue != null ? fatigue : "–"}</span>
          </div>
        </QuickStatusGroup>

        <QuickStatusGroup title="进食">
          <input
            value={diet}
            disabled={!isEditor}
            onChange={(e) => {
              setDiet(e.target.value);
              save({ diet: e.target.value });
            }}
            placeholder="早餐: 豆浆油条…"
            className="w-52 rounded-xl bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300"
          />
        </QuickStatusGroup>
      </section>

      {!isEditor && (
        <p className="px-4 pt-2 text-sm text-warm/50">你是观看者, 无法编辑内容。</p>
      )}

      {/* 编辑 / 预览 */}
      <main className="flex-1 flex gap-4 px-4 py-4 min-h-0">
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center gap-1 mb-2">
            {toolbar.map((t) => (
              <button
                key={t.title}
                onClick={t.fn}
                disabled={!isEditor}
                title={t.title}
                className="w-9 h-9 rounded-xl bg-white shadow-sm hover:bg-board text-sm font-semibold flex items-center justify-center disabled:opacity-40"
              >
                {t.label}
              </button>
            ))}
          </div>
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => onContentChange(e.target.value)}
            disabled={!isEditor}
            placeholder="用 Markdown 记录此刻…"
            className="flex-1 min-h-[60vh] w-full rounded-2xl bg-white/80 p-4 text-base leading-relaxed outline-none focus:ring-2 focus:ring-blue-300 resize-none font-sans"
          />
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

        <div className="flex-1 min-w-0 bg-white/60 rounded-2xl p-5 overflow-auto max-h-[calc(100vh-220px)]">
          {content.trim() ? (
            preview
          ) : (
            <p className="text-warm/40 text-center mt-10">预览区 — 输入 Markdown 后实时显示</p>
          )}
        </div>
      </main>
    </div>
  );
}

function QuickStatusGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white/70 p-2.5 shadow-sm">
      <p className="text-xs text-warm/50 mb-1.5">{title}</p>
      {children}
    </div>
  );
}
