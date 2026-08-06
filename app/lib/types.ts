export type Role = "editor" | "viewer";
export type BoardType = "sticky" | "canvas";
export type AlignH = "left" | "center" | "right";
export type AlignV = "top" | "middle" | "bottom";

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  createdAt: number;
}

export interface BoardSummary {
  id: string;
  ownerId: string;
  name: string;
  type: BoardType;
  role: Role;
  memberCount: number;
  noteCount: number;
  updatedAt: number;
  createdAt: number;
}

export interface Note {
  id: string;
  boardId: string;
  authorId: string;
  content: string;
  posX: number;
  posY: number;
  zIndex: number;
  width: number;
  // 元属性 (Obsidian 式): 动态添加, 只有用户添加才显示
  meta: Record<string, string>;
  mood: string | null;
  weather: string | null;
  fatigue: number | null;
  diet: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Invitation {
  id: string;
  boardId: string;
  boardName: string;
  inviterId: string;
  inviterName: string;
  role: Role;
  status: "pending" | "accepted" | "declined";
  createdAt: number;
}

export interface BoardDetail {
  id: string;
  name: string;
  ownerId: string;
  type: BoardType;
  role: Role;
}

// 无限画布板的内容物: 可自由放置/对齐的文本块 (支持 markdown 图片)
export interface Block {
  id: string;
  boardId: string;
  authorId: string;
  text: string;
  posX: number;
  posY: number;
  zIndex: number;
  width: number;
  alignH: AlignH;
  alignV: AlignV;
  createdAt: number;
  updatedAt: number;
}

export interface UserSettings {
  defaultBoardId: string | null;
}

export type PatchEntity = "note" | "board" | "block";

export interface PatchEvent {
  type: "patch";
  entity: PatchEntity;
  id: string;
  changes: Record<string, unknown>;
  updatedAt: number;
  sender: string;
}
