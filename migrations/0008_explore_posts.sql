-- 探索帖子产品: 地点 (locations) / 帖子 (posts) / 帖子媒体 (post_media)
-- 旧旅行地图模型 (places/place_notes) 整体移除, 数据不迁移

DROP TABLE IF EXISTS place_notes;
DROP TABLE IF EXISTS places;

CREATE TABLE locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  amap_poi_id TEXT,
  post_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
-- 同一高德 POI 只对应一个地点; 无 POI 的地点按坐标邻近匹配 (应用层)
CREATE UNIQUE INDEX idx_locations_poi ON locations(amap_poi_id) WHERE amap_poi_id IS NOT NULL;
CREATE INDEX idx_locations_lat_lng ON locations(lat, lng);

CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES users(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  -- 坐标/名称快照: 地点后续改名或合并时, 历史帖子仍保留发帖时信息
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  place_name TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  cover_url TEXT,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_posts_location ON posts(location_id, created_at DESC, id DESC);
CREATE INDEX idx_posts_author ON posts(author_id, created_at DESC, id DESC);

CREATE TABLE post_media (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'image' CHECK (kind IN ('image', 'video')),
  r2_key TEXT NOT NULL,
  width INTEGER NOT NULL DEFAULT 0,
  height INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_post_media_post ON post_media(post_id, position);
