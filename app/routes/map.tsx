import ExploreMap from "~/components/map/ExploreMap";
import { getSessionUser } from "~/server/auth";
import type { Route } from "./+types/map";

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await getSessionUser(request, context.cloudflare.env);
  return { user };
}

export default function MapRoute({ loaderData }: Route.ComponentProps) {
  return <ExploreMap user={loaderData.user} />;
}
