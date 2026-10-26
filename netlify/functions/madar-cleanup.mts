import { getDatabase } from "@netlify/database";
import type { Config } from "@netlify/functions";

export default async () => {
  const db = getDatabase();
  await db.sql`DELETE FROM madar_login_attempts WHERE expires_at<now()`;
  await db.sql`DELETE FROM madar_sessions WHERE expires_at<now()`;
  await db.sql`DELETE FROM madar_changesets WHERE status='pending' AND created_at<now()-interval '24 hours'`;
  return new Response(null, { status: 204 });
};
export const config: Config = { schedule: "0 1 * * *" };
