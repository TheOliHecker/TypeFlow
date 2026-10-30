import { NextResponse } from "next/server";
import { adminSession, checkOrigin, login, logout } from "@/lib/developer/auth";
import { session, googleRequest } from "@/lib/google/server";
export const runtime = "nodejs";
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  try {
    checkOrigin(request, true);
    const { action } = await context.params;
    const raw = await request.text();
    if (raw.length > 400_000) return json({ error: "Request too large." }, 413);
    const data = JSON.parse(raw);
    if (action === "unlock") {
      await login(typeof data.password === "string" ? data.password : "");
      return json({ unlocked: true });
    }
    const admin = await adminSession();
    if (action === "lock") {
      await logout();
      return json({ locked: true });
    }
    if (action === "control") {
      if (data.command === "start") {
        if (admin.running)
          return json(
            {
              error:
                "An experiment is already running in this administrator session.",
            },
            409,
          );
        if (typeof data.run !== "string" || !/^[\w-]{1,100}$/.test(data.run))
          return json({ error: "Invalid experiment ID." }, 400);
        admin.run = data.run;
        admin.running = true;
        admin.created = 0;
        admin.started = Date.now();
      } else {
        if (data.run !== admin.run)
          return json(
            {
              error:
                "Experiment identity changed. Stop the active experiment first.",
            },
            409,
          );
        if (data.command === "resume") {
          if (!admin.started || Date.now() - admin.started > 25 * 60_000)
            return json(
              { error: "Experiment exceeded its wall time limit." },
              409,
            );
          admin.running = true;
        } else if (["pause", "stop", "emergency"].includes(data.command))
          admin.running = false;
        else return json({ error: "Unknown control." }, 400);
      }
      return json({ running: admin.running });
    }
    const s = await session();
    if (!s)
      return json(
        {
          error:
            "Google authorization expired. Reconnect in the workspace; reconcile before resuming.",
        },
        401,
      );
    let response: Response;
    if (action === "create" || action === "batch") {
      if (
        !admin.running ||
        admin.run !== data.run ||
        !admin.started ||
        Date.now() - admin.started > 25 * 60_000
      )
        return json(
          { error: "Experiment is stopped or expired; no new write was sent." },
          409,
        );
    }
    if (action === "create") {
      if (admin.created >= 8 || admin.documents.size >= 40)
        return json(
          {
            error:
              "Test document limit reached. Lock and unlock to start a new session.",
          },
          409,
        );
      admin.created++;
      response = await googleRequest(s, "", {
        title: `TypeFlow Automated Test ${admin.run} · ${admin.created}`,
      });
      if (response.ok) {
        const doc = await response.json();
        admin.documents.add(doc.documentId);
        return json(doc);
      }
    } else {
      if (
        typeof data.documentId !== "string" ||
        !admin.documents.has(data.documentId)
      )
        return json(
          {
            error:
              "Only test documents created in this administrator session are authorized.",
          },
          403,
        );
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
          return json({ error: "Invalid revision-aware batch." }, 400);
        response = await googleRequest(s, `${path}:batchUpdate`, {
          requests: data.requests,
          writeControl: { requiredRevisionId: data.revision },
        });
      } else return json({ error: "Unknown developer action." }, 404);
    }
    if (!response.ok)
      return json(
        {
          error: `Google returned HTTP ${response.status}. Pause and reconcile before retrying.`,
          retryAfterMs: Math.min(
            60_000,
            (Number(response.headers.get("retry-after")) || 2) * 1000,
          ),
        },
        response.status,
      );
    return json(await response.json());
  } catch {
    return json(
      {
        error:
          "Developer request denied or unavailable. Check local configuration, session, password, and login limits. An interrupted Google write requires reconciliation.",
      },
      403,
    );
  }
}
