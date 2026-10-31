import {
  GoogleApiError,
  type GoogleTransport,
} from "../../src/lib/google/adapter";
export const SCOPE = "https://www.googleapis.com/auth/drive.file";
const messages: Record<number, string> = {
  400: "Google rejected the operation or the revision changed. Reconcile the document before resuming.",
  401: "Google authorization expired. Connect Google again, then reconcile.",
  403: "Google denied access. Check the connected account, document permission, and Docs/Drive API configuration.",
  404: "This document is unavailable to TypeFlow. Select an authorized document or create a new one.",
  429: "Google request limit reached. Waiting before a bounded retry.",
};
export async function token(interactive = false) {
  if (!chrome.runtime.getManifest().oauth2?.client_id)
    throw new Error(
      "Google connection is disabled in this review build. The publisher must configure TYPEFLOW_EXTENSION_CLIENT_ID and rebuild before Google sign-in can work.",
    );
  let result: chrome.identity.GetAuthTokenResult;
  try {
    result = await chrome.identity.getAuthToken({
      interactive,
      enableGranularPermissions: true,
    });
  } catch {
    throw new Error(
      "Google connection is unavailable or was declined. Connect Google to continue. Check Chrome sign-in and the extension OAuth client if this persists.",
    );
  }
  if (
    !result.token ||
    (result.grantedScopes && !result.grantedScopes.includes(SCOPE))
  )
    throw new Error(
      "Google document access was not granted. Connect again and approve access to files used with TypeFlow.",
    );
  return result.token;
}
async function request(url: string, init: RequestInit = {}) {
  const accessToken = await token();
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      signal: init.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(12_000)])
        : AbortSignal.timeout(12_000),
      cache: "no-store",
    });
  } catch {
    throw new Error(
      "Google could not be reached. A write may have completed. Check your connection, then reconcile before resuming.",
    );
  }
  if (!response.ok) {
    if (response.status === 401)
      await chrome.identity.removeCachedAuthToken({ token: accessToken });
    throw new GoogleApiError(
      messages[response.status] ??
        "Google is temporarily unavailable. Reconcile before retrying an uncertain write.",
      response.status,
      Math.min(
        60_000,
        Math.max(0, Number(response.headers.get("retry-after")) || 0) * 1000,
      ),
    );
  }
  return response.json();
}
export const extensionGoogleTransport: GoogleTransport = {
  async request(action, body, signal) {
    const root = "https://docs.googleapis.com/v1/documents";
    if (action === "create")
      return request(root, {
        method: "POST",
        body: JSON.stringify({ title: body.title || "TypeFlow document" }),
        signal,
      });
    if (
      typeof body.documentId !== "string" ||
      !/^[\w-]{1,200}$/.test(body.documentId)
    )
      throw new Error("Invalid document ID.");
    const path = `${root}/${encodeURIComponent(body.documentId)}`;
    return action === "read"
      ? request(`${path}?includeTabsContent=true`, { signal })
      : request(`${path}:batchUpdate`, {
          method: "POST",
          signal,
          body: JSON.stringify({
            requests: body.requests,
            writeControl: { requiredRevisionId: body.revision },
          }),
        });
  },
};
export type AuthorizedDocument = { id: string; name: string };
export async function listDocuments(
  pageToken?: string,
): Promise<{ files: AuthorizedDocument[]; nextPageToken?: string }> {
  const params = new URLSearchParams({
    q: "mimeType='application/vnd.google-apps.document' and trashed=false",
    fields: "files(id,name),nextPageToken",
    orderBy: "modifiedTime desc",
    pageSize: "100",
    ...(pageToken ? { pageToken } : {}),
  });
  return request(`https://www.googleapis.com/drive/v3/files?${params}`);
}
export async function disconnectGoogle() {
  let accessToken: string | undefined;
  try {
    accessToken = await token();
  } catch {
    /* No usable cached credential. */
  }
  if (!accessToken) {
    await chrome.identity.clearAllCachedAuthTokens();
    throw new Error(
      "Cached sign-in cleared, but Google revocation could not be confirmed. Remove TypeFlow at myaccount.google.com/connections.",
    );
  }
  if (accessToken) {
    let response: Response;
    try {
      response = await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: accessToken }),
        signal: AbortSignal.timeout(12_000),
      });
    } catch {
      throw new Error(
        "Revocation could not be confirmed. Retry disconnect or remove TypeFlow at myaccount.google.com/connections.",
      );
    }
    if (!response.ok && response.status !== 400)
      throw new Error(
        "Google did not confirm revocation. Retry or remove TypeFlow at myaccount.google.com/connections.",
      );
  }
  await chrome.identity.clearAllCachedAuthTokens();
}
