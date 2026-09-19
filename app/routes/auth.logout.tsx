import { redirect } from "react-router";
import { destroySessionHeaders } from "~/server/auth";
import type { Route } from "./+types/auth.logout";

async function logout({ context }: Route.ActionArgs | Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const headers = await destroySessionHeaders(env);
  return redirect("/", { headers });
}

export const loader = logout;
export const action = logout;
