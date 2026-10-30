import { NextResponse } from "next/server";
import {
  authorize,
  callback,
  config,
  csrf,
  disconnect,
  googleRequest,
  session,
} from "@/lib/google/server";
export const runtime = "nodejs";
const json = (body: unknown, status = 200, headers = {}) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
export async function GET(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  const { action } = await context.params;
  try {
    if (action === "connect") return NextResponse.redirect(await authorize());
    if (action === "callback") {
      await callback(new URL(request.url));
      return NextResponse.redirect(new URL("/workspace", config().origin));
    }
    if (action === "status") {
      const s = await session();
      return json({ connected: !!s, email: s?.email, expires: s?.expires });
    }
    return json({ error: "Unknown action." }, 404);
  } catch (error) {
    if (action === "callback") {
      const url = new URL("/workspace", config().origin);
      url.searchParams.set("google_error", (error as Error).message);
      return NextResponse.redirect(url);
    }
    return json({ error: (error as Error).message }, 400);
  }
}
export async function POST(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  try {
    csrf(request);
    const { action } = await context.params;
    if (action === "disconnect") {
      await disconnect();
      return json({ disconnected: true });
    }
    const s = await session();
    if (!s)
      return json(
        {
          error:
            "Google session expired or server restarted. Connect again, then recover the saved session.",
        },
        401,
      );
    const raw = await request.text();
    if (raw.length > 500_000)
      return json({ error: "Google batch exceeds the size limit." }, 413);
    const data = JSON.parse(raw);
    let response: Response;
    if (action === "create") {
      if (typeof data.title !== "string" || data.title.length > 200)
        return json(
          { error: "Document title must be at most 200 characters." },
          400,
        );
      response = await googleRequest(s, "", {
        title: data.title || "TypeFlow document",
      });
    } else {
      if (
        typeof data.documentId !== "string" ||
        !/^[\w-]{1,200}$/.test(data.documentId)
      )
        return json({ error: "Invalid document ID." }, 400);
      const path = `/${encodeURIComponent(data.documentId)}`;
      if (action === "read")
        response = await googleRequest(s, `${path}?includeTabsContent=true`);
      else if (action === "batch") {
        if (
          !Array.isArray(data.requests) ||
          !data.requests.length ||
          data.requests.length > 400 ||
          typeof data.revision !== "string"
        )
          return json(
            { error: "Invalid editing batch or missing revision." },
            400,
          );
        response = await googleRequest(s, `${path}:batchUpdate`, {
          requests: data.requests,
          writeControl: { requiredRevisionId: data.revision },
        });
      } else return json({ error: "Unknown action." }, 404);
    }
    if (!response.ok) {
      // Do not forward upstream details that might contain private document text.
      const messages: Record<number, string> = {
        400: "Google rejected the batch or the document revision changed. Recover to check for collaborator changes.",
        401: "Google authorization expired. Connect again.",
        403: "Google denied access. Check document permissions and the enabled Docs API.",
        404: "Google document was not found.",
        429: "Google request limit reached. Waiting before a bounded retry.",
      };
      return json(
        {
          error:
            messages[response.status] ??
            "Google is temporarily unavailable. The write may have completed; recover before retrying.",
        },
        response.status,
        { "Retry-After": response.headers.get("retry-after") ?? "2" },
      );
    }
    return json(await response.json());
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes("CSRF")) return json({ error: message }, 403);
    if (message.includes("configured") || message.includes("redirect URI"))
      return json({ error: message }, 400);
    return json(
      {
        error:
          "Google request failed or timed out. Its outcome may be uncertain. Recover before retrying.",
      },
      503,
    );
  }
}
