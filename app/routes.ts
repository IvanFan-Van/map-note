import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("auth/login", "routes/auth.login.tsx"),
  route("auth/callback", "routes/auth.callback.tsx"),
  route("auth/logout", "routes/auth.logout.tsx"),
  route("b/:boardId", "routes/board.tsx"),
  route("b/:boardId/n/:noteId", "routes/note.tsx"),
  // API
  route("api/user", "routes/api/user.tsx"),
  route("api/boards", "routes/api/boards.tsx"),
  route("api/boards/:id", "routes/api/board.tsx"),
  route("api/notes", "routes/api/notes.tsx"),
  route("api/notes/:id", "routes/api/note.tsx"),
  route("api/notes/:id/position", "routes/api/note-position.tsx"),
  route("api/links", "routes/api/links.tsx"),
  route("api/links/:id", "routes/api/link.tsx"),
  route("api/invitations", "routes/api/invitations.tsx"),
  route("api/invitations/inbox", "routes/api/invitations.inbox.tsx"),
  route("api/invitations/:id", "routes/api/invitation.tsx"),
  route("api/images", "routes/api/images.tsx"),
  route("api/pusher/auth", "routes/api/pusher-auth.tsx"),
  route("images/*", "routes/images.$.tsx"),
] satisfies RouteConfig;
