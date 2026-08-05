-- 0003_add_note_meta.sql — 便笺元属性 (Obsidian 式, JSON 对象: { key: value })
ALTER TABLE notes ADD COLUMN meta TEXT NOT NULL DEFAULT '{}';
