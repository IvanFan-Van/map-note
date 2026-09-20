-- 坐标体系标记: 旧数据为 WGS-84 (OSM/Nominatim), 2026-09 起客户端改为 GCJ-02 (高德)
-- 存量数据由 scripts/convert-coords-to-gcj.mjs 转换后将本列更新为 gcj02
ALTER TABLE places ADD COLUMN coord_system TEXT NOT NULL DEFAULT 'wgs84';
