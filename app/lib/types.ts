// ---------- 地图旅行笔记: 领域类型 ----------

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  createdAt: number;
}

/** 照片: 存于 R2, 通过 /images/... 路由鉴权访问 */
export interface PhotoItem {
  key: string;
  url: string;
}

/** 元信息: 1-5 分 (5 分最高); custom=false 表示四个预设之一 */
export interface MetaItem {
  id: string;
  label: string;
  score: number;
  custom: boolean;
}

/** 四个预设元信息 */
export const PRESET_META_LABELS = ["满意度", "价格", "性价比", "好玩程度"] as const;

/** 地点默认描述 (与 places 表默认值一致) */
export const DEFAULT_PLACE_DESCRIPTION = "还未有任何描述";

/** 地点 (标记) — 列表接口返回, 附带该地点的笔记组 */
export interface Place {
  id: string;
  ownerId: string;
  name: string;
  address: string;
  description: string;
  lat: number;
  lng: number;
  photos: PhotoItem[];
  metas: MetaItem[];
  /** 路线顺序: 箭头由上一条路径指向本地点 */
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  /** 笔记组 (可选, 用户主动记录) */
  notes: PlaceNote[];
}

/** 地点笔记: 属于某个地点的一组有序笔记 */
export interface PlaceNote {
  id: string;
  placeId: string;
  content: string;
  position: number;
  createdAt: number;
  updatedAt: number;
}

/** 地理编码结果 (高德 Web 服务代理, GCJ-02 坐标) */
export interface GeocodeResult {
  lat: number;
  lng: number;
  name: string;
  displayName: string;
}
/** 地点摘要 (别名, 便于组件语义化使用) */
export type PlaceSummary = Place;
