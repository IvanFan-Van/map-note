/** 经纬度是否为有效的 GCJ-02 坐标 */
export function isValidLatLng(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
    Number.isFinite(lng) && lng >= -180 && lng <= 180
  );
}

/** 校验帖子内容: 合法时返回 null, 否则返回错误信息 */
export function validatePostContent(content: string): string | null {
  if (content.length > 10000) return "正文不能超过 10000 个字符";
  return null;
}
