import { redirect } from "react-router";
import { destroySessionHeaders } from "~/server/auth";
import type { Route } from "./+types/auth.logout";

export async function action({ request: _request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const headers = await destroySessionHeaders(env);
  return redirect("/", { headers });
}

export async function loader({ request: _request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const headers = await destroySessionHeaders(env);
  return redirect("/", { headers });
}
