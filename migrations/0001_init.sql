-- 0001_init.sql — 初始 schema: 用户 / 背景板 / 成员 / 邀请 / 便笺 / 连线 / 设置
-- 时间戳统一为 Unix 毫秒 (INTEGER)

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE boards (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL DEFAULT '我的生活',
  created_at INTEGER NOT NULL
);

CREATE TABLE board_members (
  board_id TEXT NOT NULL REFERENCES boards(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (board_id, user_id)
);

CREATE TABLE invitations (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id),
  inviter_id TEXT NOT NULL REFERENCES users(id),
  invitee_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id),
  author_id TEXT NOT NULL REFERENCES users(id),
  content TEXT NOT NULL DEFAULT '',
  pos_x REAL NOT NULL DEFAULT 0,
  pos_y REAL NOT NULL DEFAULT 0,
  z_index INTEGER NOT NULL DEFAULT 0,
  width INTEGER NOT NULL DEFAULT 260,
  mood TEXT,
  weather TEXT,
  fatigue INTEGER CHECK (fatigue BETWEEN 0 AND 10),
  diet TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE links (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id),
  from_note_id TEXT NOT NULL REFERENCES notes(id),
  to_note_id TEXT NOT NULL REFERENCES notes(id),
  color TEXT NOT NULL DEFAULT '#e11d48',
  thickness REAL NOT NULL DEFAULT 2,
  created_at INTEGER NOT NULL
);

CREATE TABLE user_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  default_board_id TEXT REFERENCES boards(id),
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_members_user ON board_members(user_id);
CREATE INDEX idx_notes_board ON notes(board_id);
CREATE INDEX idx_links_board ON links(board_id);
CREATE INDEX idx_invites_invitee ON invitations(invitee_id, status);
