import { Link } from "react-router";
import type { BoardMemberInfo } from "~/lib/pusher";

// ---------- 背景板顶部工具栏 (便笺板 / 无限画布板共用) ----------

export function BoardHeader({
  backTo,
  name,
  connected,
  members,
  isEditor,
  onInviteClick,
  defaultStar,
  children,
}: {
  backTo: string;
  name: string;
  connected: boolean;
  members: Record<string, BoardMemberInfo>;
  isEditor: boolean;
  onInviteClick?: () => void;
  defaultStar?: {
    isDefault: boolean;
    canSet: boolean;
    onSet: () => void;
  } | null;
  children?: React.ReactNode;
}) {
  return (
    <header className="absolute top-0 inset-x-0 z-[200] flex items-center gap-3 px-4 py-2.5 bg-white/70 backdrop-blur shadow-sm">
      <Link to={backTo} className="text-lg hover:text-warm/60">
        ←
      </Link>
      <h1 className="text-lg truncate">{name}</h1>
      {defaultStar &&
        (defaultStar.isDefault ? (
          <span className="text-amber-500 text-sm" title="默认背景板">
            ★
          </span>
        ) : (
          defaultStar.canSet && (
            <button
              onClick={defaultStar.onSet}
              className="text-warm/40 hover:text-amber-500 text-sm"
              title="设为默认背景板"
            >
              ☆
            </button>
          )
        ))}
      <span
        className={`ml-auto flex items-center gap-1.5 text-sm ${
          connected ? "text-green-600" : "text-warm/50"
        }`}
      >
        <span
          className={`w-2.5 h-2.5 rounded-full ${
            connected ? "bg-green-500" : "bg-warm/40 animate-pulse"
          }`}
        />
        {connected ? "已连接" : "连接中"}
      </span>
      <div className="flex -space-x-2">
        {Object.entries(members)
          .filter(([, m]) => m.name)
          .map(([id, m]) =>
            m.avatarUrl ? (
              <img
                key={id}
                src={m.avatarUrl}
                alt={m.name}
                title={m.name}
                className="w-7 h-7 rounded-full border-2 border-white"
              />
            ) : (
              <span
                key={id}
                title={m.name}
                className="w-7 h-7 rounded-full border-2 border-white bg-note flex items-center justify-center text-xs"
              >
                {m.name.slice(0, 1)}
              </span>
            ),
          )}
      </div>
      {children}
      {isEditor && onInviteClick && (
        <button
          onClick={onInviteClick}
          className="rounded-xl bg-warm text-white px-3 py-1.5 text-sm hover:opacity-90"
        >
          邀请
        </button>
      )}
      {!isEditor && (
        <span className="rounded-full bg-warm/10 px-3 py-1 text-sm text-warm/70">
          只读
        </span>
      )}
    </header>
  );
}
