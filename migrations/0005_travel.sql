-- 0005_travel.sql — 地图旅行笔记: 地点 (places) 与地点笔记 (place_notes)
-- 时间戳统一为 Unix 毫秒 (INTEGER); photos/metas 以 JSON 文本列存储

CREATE TABLE places (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '还未有任何描述',
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  photos TEXT NOT NULL DEFAULT '[]',
  metas TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_places_owner ON places(owner_id);

CREATE TABLE place_notes (
  id TEXT PRIMARY KEY,
  place_id TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_place_notes_place ON place_notes(place_id);
