import { createRoot, type Root } from "react-dom/client";
import type * as L from "leaflet";

export type LeafletLib = typeof import("leaflet");

export interface PopupHandle {
  popup: L.Popup;
  close: () => void;
}

/**
 * 在 Leaflet popup 中挂载 React 内容。
 * popupopen 时创建 root 渲染, popupclose/remove 时卸载, 避免泄漏。
 * Lmod 为客户端动态加载的 leaflet 模块 (SSR 端不可用)。
 */
export function openReactPopup(
  Lmod: LeafletLib,
  map: L.Map,
  latlng: L.LatLngExpression,
  render: (close: () => void) => React.ReactNode,
  options?: L.PopupOptions,
): PopupHandle {
  const popup = Lmod.popup({ closeButton: false, ...options });
  popup.setContent('<div class="popup-react-mount"></div>');
  let root: Root | null = null;
  const mount = () => {
    if (root) return;
    const el = popup.getElement()?.querySelector(".popup-react-mount");
    if (!el) return;
    root = createRoot(el as HTMLElement);
    root.render(render(close));
  };
  const unmount = () => {
    root?.unmount();
    root = null;
  };
  popup.on("popupopen", mount);
  popup.on("popupclose", unmount);
  popup.on("remove", unmount);
  const close = () => {
    unmount();
    popup.close();
  };
  popup.openOn(map);
  return { popup, close };
}