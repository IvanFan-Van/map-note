import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/map.tsx"),
  route("auth/login", "routes/auth.login.tsx"),
  route("auth/callback", "routes/auth.callback.tsx"),
  route("auth/logout", "routes/auth.logout.tsx"),
  // API
  route("api/user", "routes/api/user.tsx"),
  route("api/places", "routes/api/places.tsx"),
  route("api/places/:id", "routes/api/place.tsx"),
  route("api/places/:id/notes", "routes/api/place-notes.tsx"),
  route("api/places/:id/notes/:noteId", "routes/api/place-note.tsx"),
  route("api/geocode", "routes/api/geocode.tsx"),
  route("api/reverse", "routes/api/reverse.tsx"),
  route("api/images", "routes/api/images.tsx"),
  route("images/*", "routes/images.$.tsx"),
] satisfies RouteConfig;
