import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/map.tsx"),
  route("posts/:id", "routes/posts.$id.tsx"),
  route("auth/login", "routes/auth.login.tsx"),
  route("auth/callback", "routes/auth.callback.tsx"),
  route("auth/logout", "routes/auth.logout.tsx"),
  // API
  route("api/user", "routes/api/user.tsx"),
  route("api/map", "routes/api/map.tsx"),
  route("api/locations/:id/posts", "routes/api/locations.$id.posts.tsx"),
  route("api/posts", "routes/api/posts.tsx"),
  route("api/posts/:id", "routes/api/posts.$id.tsx"),
  route("api/posts/:id/media", "routes/api/posts.$id.media.tsx"),
  route("api/posts/:id/media/:mediaId", "routes/api/posts.$id.media.$mediaId.tsx"),
  route("api/geocode", "routes/api/geocode.tsx"),
  route("api/reverse", "routes/api/reverse.tsx"),
  route("images/*", "routes/images.$.tsx"),
] satisfies RouteConfig;
