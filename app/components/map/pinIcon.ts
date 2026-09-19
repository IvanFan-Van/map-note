const PIN_PATH = "M15 1C7.8 1 2 6.8 2 14c0 9.6 13 26 13 26s13-16.4 13-26C28 6.8 22.2 1 15 1z";

export const PLACE_PIN_COLOR = "#f97316";
export const DRAFT_PIN_COLOR = "#e11d48";

function pinInnerHtml(color: string, thumbUrl?: string): string {
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

/** 地点标记内容 (高德 Marker content): 颜色区分正式标记/草稿标记, 可附带照片缩略图 */
export function pinHtml(
  color: string,
  options?: { thumbUrl?: string; wrapperClass?: string },
): string {
  const wrapper = options?.wrapperClass ?? "place-pin-wrap";
  return '<div class="' + wrapper + '">' + pinInnerHtml(color, options?.thumbUrl) + "</div>";
}

/** 标记聚合内容 (高德 MarkerCluster renderClusterMarker): 圆形计数 */
export function clusterHtml(count: number): string {
  return '<div class="cluster-icon-wrap"><div class="cluster-icon"><span>' + count + "</span></div></div>";
}

/** 路线方向箭头内容: 按方位角旋转, 指向下一个地点 */
export function arrowHtml(angleDeg: number, color: string): string {
  return (
    '<div class="route-arrow" style="transform: rotate(' + angleDeg.toFixed(1) + 'deg)">' +
    '<svg viewBox="0 0 12 12" width="12" height="12">' +
    '<path d="M1 1 L11 6 L1 11 Z" fill="' + color + '"/></svg></div>'
  );
}
