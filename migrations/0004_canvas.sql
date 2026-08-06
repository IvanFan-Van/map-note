-- 0004_canvas.sql — 无限画布背景板: boards 类型 + 文本块 (blocks)
ALTER TABLE boards ADD COLUMN type TEXT NOT NULL DEFAULT 'sticky' CHECK (type IN ('sticky', 'canvas'));

CREATE TABLE blocks (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id),
  author_id TEXT NOT NULL REFERENCES users(id),
  text TEXT NOT NULL DEFAULT '',
  pos_x REAL NOT NULL DEFAULT 0,
  pos_y REAL NOT NULL DEFAULT 0,
  z_index INTEGER NOT NULL DEFAULT 0,
  width INTEGER NOT NULL DEFAULT 240,
  align_h TEXT NOT NULL DEFAULT 'left' CHECK (align_h IN ('left', 'center', 'right')),
  align_v TEXT NOT NULL DEFAULT 'top' CHECK (align_v IN ('top', 'middle', 'bottom')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_blocks_board ON blocks (board_id);
