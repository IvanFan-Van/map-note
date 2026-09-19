/** 经纬度是否为有效的 WGS84 坐标 */
export function isValidLatLng(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
    Number.isFinite(lng) && lng >= -180 && lng <= 180
  );
}

/** 校验笔记内容: 合法时返回 null, 否则返回错误信息 */
export function validateNoteContent(content: string): string | null {
  if (content.length < 1) return "笔记内容不能为空";
  if (content.length > 5000) return "笔记内容不能超过 5000 个字符";
  return null;
}
