// ---------- 探索帖子: 领域类型 ----------

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  createdAt: number;
}

/** 帖子作者摘要 (列表/详情展示用) */
export interface PostAuthor {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/** 帖子媒体: 存于 R2, 通过 /images/... 路由访问 */
export interface PostMedia {
  id: string;
  kind: "image" | "video";
  key: string;
  url: string;
  width: number;
  height: number;
  position: number;
}

/** 帖子 (详情): 必带定位 */
export interface Post {
  id: string;
  authorId: string;
  locationId: string;
  lat: number;
  lng: number;
  placeName: string;
  address: string;
  title: string;
  content: string;
  coverUrl: string | null;
  visibility: "public" | "private";
  createdAt: number;
  updatedAt: number;
  media: PostMedia[];
  author: PostAuthor | null;
}

/** 帖子列表项 (抽屉/个人页) */
export interface PostSummary {
  id: string;
  title: string;
  coverUrl: string | null;
  createdAt: number;
  author: PostAuthor | null;
}

/** 地图上的地点 (含帖子数量) */
export interface LocationPoint {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  postCount: number;
}

/** 地理编码结果 (高德 Web 服务代理, GCJ-02 坐标) */
export interface GeocodeResult {
  lat: number;
  lng: number;
  name: string;
  displayName: string;
  amapPoiId?: string;
}

/** 发帖定位草稿: 由 GPS / 搜索 / 拖动确定 */
export interface DraftPoint {
  lat: number;
  lng: number;
  name: string;
  address: string;
  amapPoiId?: string;
}
