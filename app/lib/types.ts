export type Role = "editor" | "viewer";

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
  role: Role;
}

export interface UserSettings {
  defaultBoardId: string | null;
}

export type PatchEntity = "note" | "board";

export interface PatchEvent {
  type: "patch";
  entity: PatchEntity;
  id: string;
  changes: Record<string, unknown>;
  updatedAt: number;
  sender: string;
}
