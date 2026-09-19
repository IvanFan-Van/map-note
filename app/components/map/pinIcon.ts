import type * as L from "leaflet";
import type { LeafletLib } from "./reactPopup";

const PIN_PATH =
  "M15 1C7.8 1 2 6.8 2 14c0 9.6 13 26 13 26s13-16.4 13-26C28 6.8 22.2 1 15 1z";

export const PLACE_PIN_COLOR = "#f97316";
export const DRAFT_PIN_COLOR = "#e11d48";

function pinHtml(color: string, thumbUrl?: string): string {
  const thumb = thumbUrl
    ? '<span class="pin-thumb" style="background-image:url(\'' + thumbUrl + '\')"></span>'
    : "";
  return (
    '<div class="place-pin"><svg viewBox="0 0 30 42" width="30" height="42">' +
    '<path d="' + PIN_PATH + '" fill="' + color + '" stroke="#fff" stroke-width="2"/>' +
    '<circle cx="15" cy="14" r="5.5" fill="#fff"/></svg>' +
    thumb +
    "</div>"
  );
}

/** 地点标记图标: 颜色区分正式标记/草稿标记, 可附带照片缩略图 */
export function createPinIcon(
  leaflet: LeafletLib,
  options: {
    color: string;
    className: string;
    thumbUrl?: string;
    popupAnchor?: [number, number];
  },
): L.DivIcon {
  return leaflet.divIcon({
    className: options.className,
    html: pinHtml(options.color, options.thumbUrl),
    iconSize: [30, 42],
    iconAnchor: [15, 40],
    popupAnchor: options.popupAnchor,
  });
}

/** 标记聚合图标: 圆形计数 */
export function createClusterIcon(leaflet: LeafletLib, count: number): L.DivIcon {
  return leaflet.divIcon({
    html: '<div class="cluster-icon"><span>' + count + "</span></div>",
    className: "cluster-icon-wrap",
    iconSize: [42, 42],
    iconAnchor: [21, 21],
  });
}
