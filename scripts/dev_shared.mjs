// Local-only database and API. Configuration stays outside Git.
import fs from "node:fs/promises";
import { createServer } from "vite";
import { NetlifyDB } from "@netlify/database-dev";
import { Pool } from "pg";

const configFile = process.argv[2];
if (!configFile)
  throw new Error("Pass an ignored JSON configuration containing accessHash.");
const { accessHash } = JSON.parse(await fs.readFile(configFile, "utf8"));
const database = new NetlifyDB({ logger: () => {} });
const pool = new Pool({ connectionString: await database.start() });
await database.applyMigrations("netlify/database/migrations");
let handler;
const api = async (incoming, outgoing) => {
  try {
    const body = [];
    for await (const chunk of incoming) body.push(chunk);
    const request = new Request(
      "http://127.0.0.1:5174/api/madar" + incoming.url,
      {
        method: incoming.method,
        headers: incoming.headers,
        body: ["GET", "HEAD"].includes(incoming.method)
          ? undefined
          : Buffer.concat(body),
      },
    );
    const response = await handler(request, "local-dev");
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    outgoing.writeHead(500);
    outgoing.end("Local API error");
  }
};
const vite = await createServer({
  server: { host: "127.0.0.1", port: 5174, strictPort: true },
  plugins: [
    {
      name: "madar-local-api",
      configureServer(server) {
        server.middlewares.use("/api/madar", api);
      },
    },
  ],
});
const { WorkspaceService } = await vite.ssrLoadModule("/server/workspace.ts");
const { createHandler } = await vite.ssrLoadModule("/server/http.ts");
const service = new WorkspaceService(pool, accessHash);
handler = createHandler(() => service);
await vite.listen();
console.log("Local shared workspace: http://127.0.0.1:5174");
async function stop() {
  await vite.close();
  await pool.end();
  await database.stop();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
