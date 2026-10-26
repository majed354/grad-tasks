import { ZodError } from "zod";
import { ApiError, sessionCookie } from "./workspace";
import type { WorkspaceService } from "./workspace";

export function createHandler(createService: () => WorkspaceService) {
  return async (req: Request, ip: string, requestId = "") => {
    const headers = {
      "Cache-Control": "no-store, private",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    };
    const respond = (body: unknown, status = 200, extra = {}) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { ...headers, ...extra },
      });
    try {
      if (Number(req.headers.get("content-length")) > 2200000)
        throw new ApiError(413, "جزء البيانات أكبر من الحد المسموح.");
      const service = createService();
      const path = new URL(req.url).pathname.replace(/^\/api\/madar/, "");
      if (path === "/session" && req.method === "POST") {
        const token = await service.login(req, ip);
        return respond(
          { authenticated: true, permissions: "shared-editor" },
          200,
          { "Set-Cookie": sessionCookie(token) },
        );
      }
      if (path === "/session" && req.method === "DELETE") {
        await service.logout(req);
        return respond({ authenticated: false }, 200, {
          "Set-Cookie": sessionCookie("", 0),
        });
      }
      if (path === "/session" && req.method === "GET") {
        await service.session(req);
        return respond({ authenticated: true, permissions: "shared-editor" });
      }
      if (path === "/workspace" && req.method === "GET")
        return respond(await service.page(req));
      if (path === "/changes" && req.method === "POST")
        return respond(await service.begin(req));
      const part = path.match(/^\/changes\/([a-f0-9-]+)\/(\d+)$/);
      if (part && req.method === "PUT")
        return respond(await service.putChunk(req, part[1], Number(part[2])));
      const commit = path.match(/^\/changes\/([a-f0-9-]+)\/commit$/);
      if (commit && req.method === "POST")
        return respond(await service.commit(req, commit[1]));
      return respond({ error: "طلب غير متاح." }, 404);
    } catch (e) {
      if (e instanceof ApiError) return respond({ error: e.message }, e.status);
      if (e instanceof ZodError || e instanceof SyntaxError)
        return respond(
          { error: "بيانات الطلب غير صالحة؛ لم تحفظ التغييرات." },
          400,
        );
      console.error("madar request failed", {
        requestId,
        type: e instanceof Error ? e.name : "unknown",
      });
      return respond(
        {
          error:
            "تعذر إكمال الطلب في مخزن مدار. حدّث المساحة للتحقق من نتيجة الحفظ قبل المحاولة مجددًا.",
        },
        503,
      );
    }
  };
}
