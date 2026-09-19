import { createRoot, type Root } from "react-dom/client";
import type { AMapLib } from "~/lib/amap";

export interface PopupOptions {
  /** 附加在信息窗容器上的类名 (place-popup / cluster-popup), 宽度由该类名控制 */
  className: string;
  /** 相对标记位置的垂直偏移 (px, 负数向上) */
  offsetY?: number;
  autoPan?: boolean;
}

interface PopupHandle {
  close: () => void;
}

let activeHandle: PopupHandle | null = null;

/** 关闭当前信息窗 (组件卸载/切换时调用, 避免 React root 泄漏) */
export function closeActivePopup(): void {
  activeHandle?.close();
  activeHandle = null;
}

/**
 * 在高德 InfoWindow (自定义窗体) 中挂载 React 内容。
 * open 时创建 root 渲染, close 时卸载; 同一时间只保留一个信息窗。
 */
export function openReactPopup(
  amap: AMapLib,
  map: AMap.Map,
  position: [number, number],
  render: (close: () => void) => React.ReactNode,
  options: PopupOptions,
): PopupHandle {
  closeActivePopup();

  const content = document.createElement("div");
  content.className = "map-info-window " + options.className;
  const mount = document.createElement("div");
  mount.className = "popup-react-mount";
  content.appendChild(mount);

  const info = new amap.InfoWindow({
    isCustom: true,
    content,
    anchor: "bottom-center",
    offset: new amap.Pixel(0, options.offsetY ?? -44),
    autoMove: options.autoPan ?? true,
    closeWhenClickMap: true,
  });

  let root: Root | null = null;
  const unmount = () => {
    root?.unmount();
    root = null;
  };
  const close = () => {
    unmount();
    info.close();
    if (activeHandle?.close === close) activeHandle = null;
  };
  info.on("open", () => {
    if (root) return;
    root = createRoot(mount);
    root.render(render(close));
  });
  info.on("close", unmount);

  info.open(map, position);
  activeHandle = { close };
  return { close };
}
