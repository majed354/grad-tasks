import { getDatabase } from "@netlify/database";
import type { Config, Context } from "@netlify/functions";
import { WorkspaceService } from "../../server/workspace";
import { createHandler } from "../../server/http";

export default async function handler(req: Request, context: Context) {
  return createHandler(
    () =>
      new WorkspaceService(
        getDatabase().pool,
        Netlify.env.get("MADAR_ACCESS_CODE_HASH") ?? "",
      ),
  )(req, context.ip, context.requestId);
}
export const config: Config = {
  path: "/api/madar/*",
  rateLimit: {
    action: "rate_limit",
    aggregateBy: "ip",
    windowSize: 60,
    windowLimit: 600,
  },
};
