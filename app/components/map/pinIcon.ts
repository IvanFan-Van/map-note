const PIN_PATH = "M15 1C7.8 1 2 6.8 2 14c0 9.6 13 26 13 26s13-16.4 13-26C28 6.8 22.2 1 15 1z";

export const POST_PIN_COLOR = "#f97316";
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

/** 地点标记内容 (高德 Marker content): 单个帖子用 pin, 草稿用红色 */
export function pinHtml(
  color: string,
  options?: { thumbUrl?: string; wrapperClass?: string },
): string {
  const wrapper = options?.wrapperClass ?? "place-pin-wrap";
  return '<div class="' + wrapper + '">' + pinInnerHtml(color, options?.thumbUrl) + "</div>";
}

/** 地点标记内容: 多个帖子时显示数量气泡 */
export function countHtml(count: number): string {
  const label = count > 99 ? "99+" : String(count);
  return '<div class="count-badge-wrap"><div class="count-badge">' + label + "</div></div>";
}
