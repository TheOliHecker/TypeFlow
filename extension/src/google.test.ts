import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  token,
  extensionGoogleTransport,
  listDocuments,
  disconnectGoogle,
} from "./google";
const identity = {
  getAuthToken: vi.fn(),
  removeCachedAuthToken: vi.fn(),
  clearAllCachedAuthTokens: vi.fn(),
};
beforeEach(() => {
  vi.clearAllMocks();
  identity.getAuthToken.mockResolvedValue({
    token: "private-credential",
    grantedScopes: ["https://www.googleapis.com/auth/drive.file"],
  });
  vi.stubGlobal("chrome", {
    identity,
    runtime: { getManifest: () => ({ oauth2: { client_id: "configured" } }) },
  });
});
afterEach(() => vi.unstubAllGlobals());
it("uses Chrome identity without persisting credentials and requests interactive consent only on demand", async () => {
  await token();
  await token(true);
  expect(
    identity.getAuthToken.mock.calls.map(([arg]) => arg.interactive),
  ).toEqual([false, true]);
});
it("fails closed for missing configuration or missing per-file scope", async () => {
  vi.stubGlobal("chrome", { identity, runtime: { getManifest: () => ({}) } });
  await expect(token(true)).rejects.toThrow("disabled in this review build");
  expect(identity.getAuthToken).not.toHaveBeenCalled();
});
it("sends conditional revisions directly to Google and never forwards upstream private errors", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response('{"error":"PRIVATE DOCUMENT EXCERPT"}', { status: 401 }),
    );
  vi.stubGlobal("fetch", fetcher);
  await expect(
    extensionGoogleTransport.request("batch", {
      documentId: "doc",
      revision: "r1",
      requests: [],
    }),
  ).rejects.toThrow("authorization expired");
  expect(identity.removeCachedAuthToken).toHaveBeenCalledWith({
    token: "private-credential",
  });
  expect(JSON.parse(fetcher.mock.calls[0][1].body).writeControl).toEqual({
    requiredRevisionId: "r1",
  });
});
it("paginates only authorized non-trashed Docs using the per-file scope", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(Response.json({ files: [], nextPageToken: "next" }));
  vi.stubGlobal("fetch", fetcher);
  await listDocuments("page2");
  const url = new URL(fetcher.mock.calls[0][0]);
  expect(url.searchParams.get("pageToken")).toBe("page2");
  expect(url.searchParams.get("q")).toContain("trashed=false");
});
it("does not silently claim revocation when Google is unavailable", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  await expect(disconnectGoogle()).rejects.toThrow(
    "Revocation could not be confirmed",
  );
  expect(identity.clearAllCachedAuthTokens).not.toHaveBeenCalled();
});
