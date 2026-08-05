/**
 * 通用确认弹窗 (底部居中浮层)。
 * 非阻塞交互 (替代 window.confirm), fixed 定位不受容器 transform/overflow 影响。
 * danger 变体用于删除等危险操作 (确认按钮红色)。
 */
export function ConfirmDialog({
  open,
  message,
  confirmLabel = "确定",
  cancelLabel = "取消",
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-[300] rounded-2xl bg-warm text-white px-5 py-3 shadow-xl flex items-center gap-4">
      <span className="text-sm">{message}</span>
      <div className="flex gap-2 shrink-0">
        <button
          onClick={onConfirm}
          className={`rounded-lg px-3 py-1 text-sm font-semibold hover:opacity-90 transition-opacity ${
            danger ? "bg-red-500 text-white" : "bg-white text-warm"
          }`}
        >
          {confirmLabel}
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg bg-white/15 px-3 py-1 text-sm hover:bg-white/25"
        >
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}
