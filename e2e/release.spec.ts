import { test, expect, chromium, type BrowserContext } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

test("public site: install/help/privacy, local writing, deletion and production developer isolation", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Chrome extension", exact: true }),
  ).toBeVisible();
  await page.goto("/install");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Your words",
  );
  for (const route of ["/help", "/privacy", "/support"]) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  await page.goto("/workspace");
  await page.getByLabel("Text to simulate", { exact: true }).fill("Test 😀.");
  await page
    .getByRole("combobox", { name: "Speed preset", exact: true })
    .selectOption("300");
  await page
    .getByRole("button", { name: "Start writing", exact: true })
    .click();
  await expect(page.getByLabel("Simulated document preview")).toContainText(
    "Test 😀.",
    { timeout: 20_000 },
  );
  await expect(
    page.getByText("Complete · All your words, in place"),
  ).toBeVisible({ timeout: 20_000 });
  await page.goto("/settings");
  await expect(page.getByText("Developer Mode", { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Delete web data…" }).click();
  await page
    .getByRole("button", { name: "Delete all web data", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("deleted");
  for (const route of ["/api/developer/unlock", "/api/google/batch"]) {
    const result = await request.post(route, { data: {} });
    expect(result.status()).toBe(404);
  }
  expect((await request.get("/developer")).status()).toBe(404);
});

async function extensionContext() {
  const profile = await mkdtemp(path.join(tmpdir(), "typeflow-e2e-"));
  const extension = path.resolve("release/typeflow-1.0.0-review");
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
    viewport: { width: 440, height: 900 },
  });
  context.setDefaultTimeout(15_000);
  const worker =
    context.serviceWorkers()[0] ??
    (await context
      .waitForEvent("serviceworker", { timeout: 3000 })
      .catch(() => undefined));
  const id = worker
    ? new URL(worker.url()).host
    : createHash("sha256")
        .update(extension)
        .digest("hex")
        .slice(0, 32)
        .replace(/[0-9a-f]/g, (n) => String.fromCharCode(97 + parseInt(n, 16)));
  return { context, id, profile };
}
async function panelPage(context: BrowserContext, id: string) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/sidepanel.html`);
  await expect(
    page.getByRole("heading", { name: "Find your flow." }),
  ).toBeVisible();
  return page;
}
test("real MV3 package: local single/evolution, pause, interrupted recovery, exports and responsive UI", async () => {
  const { context, id, profile } = await extensionContext();
  try {
    const page = await panelPage(context, id);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page
      .getByRole("combobox", { name: "Output", exact: true })
      .selectOption("local");
    await page
      .getByRole("textbox", { name: "Your text", exact: true })
      .fill("A short initial draft. 😀");
    await page
      .getByRole("combobox", { name: "Speed preset", exact: true })
      .selectOption("300");
    await page.getByRole("checkbox", { name: "I reviewed" }).check();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: "release/store/screenshot-01-setup.png" });
    await page.setViewportSize({ width: 440, height: 900 });
    await page
      .getByRole("button", { name: "Start writing", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Pause", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Resume", exact: true }),
    ).toBeVisible();
    const frozen = await page
      .getByLabel("Live preview", { exact: true })
      .textContent();
    await page.waitForTimeout(300);
    expect(
      await page.getByLabel("Live preview", { exact: true }).textContent(),
    ).toBe(frozen);
    await page.close();
    const restored = await panelPage(context, id);
    await restored
      .getByRole("button", { name: "Restore paused", exact: true })
      .click();
    await expect(
      restored.getByRole("button", { name: "Resume", exact: true }),
    ).toBeVisible();
    await restored.getByRole("button", { name: "Resume", exact: true }).click();
    await expect(restored.locator(".progress-card .pill")).toContainText(
      "completed",
      { timeout: 25_000 },
    );
    await expect(
      restored.getByLabel("Live preview", { exact: true }),
    ).toHaveText("A short initial draft. 😀");
    const download = restored.waitForEvent("download");
    await restored.getByRole("button", { name: "Export preview TXT" }).click();
    expect((await download).suggestedFilename()).toBe("typeflow-preview.txt");
    await restored
      .getByRole("combobox", { name: "Mode", exact: true })
      .selectOption("two");
    await restored
      .getByRole("textbox", { name: /^Final draft/ })
      .fill("A revised final draft! 😀");
    await restored
      .getByRole("combobox", { name: "Speed preset", exact: true })
      .nth(1)
      .selectOption("300");
    await restored.getByRole("checkbox", { name: "I reviewed" }).check();
    await restored
      .getByRole("button", { name: "Start writing", exact: true })
      .click();
    await expect(restored.locator(".progress-card .pill")).toContainText(
      "completed",
      { timeout: 25_000 },
    );
    await expect(
      restored.getByLabel("Live preview", { exact: true }),
    ).toHaveText("A revised final draft! 😀");
    await restored.setViewportSize({ width: 320, height: 800 });
    expect(
      await restored.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await restored.setViewportSize({ width: 440, height: 900 });
    await restored.evaluate(() => window.scrollTo(0, 0));
    await restored.screenshot({
      path: "release/store/panel-actual.png",
      fullPage: true,
    });
    await restored.setViewportSize({ width: 1280, height: 800 });
    await restored
      .getByRole("heading", { name: "In the flow" })
      .scrollIntoViewIfNeeded();
    await restored.screenshot({
      path: "release/store/screenshot-02-session.png",
    });
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test("review package cannot initiate unconfigured OAuth", async () => {
  const { context, id, profile } = await extensionContext();
  try {
    const page = await panelPage(context, id);
    await page
      .getByRole("button", { name: "Connect Google", exact: true })
      .click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "disabled in this review build" }),
    ).toContainText("disabled in this review build");
    expect(
      await page.evaluate(() => chrome.runtime.getManifest().oauth2),
    ).toBeUndefined();
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test("packaged Google workflow with mocked authorization/API: conditional writes, uncertain-response recovery and conflict protection", async () => {
  const { context, id, profile } = await extensionContext();
  let remote = "",
    revision = 1,
    writes = 0,
    loseAcknowledgement = true;
  try {
    await context.addInitScript(() => {
      const manifest = chrome.runtime.getManifest();
      chrome.runtime.getManifest = () => ({
        ...manifest,
        oauth2: {
          client_id: "mock-only",
          scopes: ["https://www.googleapis.com/auth/drive.file"],
        },
      });
      chrome.identity.getAuthToken = (async () => ({
        token: "mock-token",
        grantedScopes: ["https://www.googleapis.com/auth/drive.file"],
      })) as typeof chrome.identity.getAuthToken;
    });
    await context.route(
      "https://www.googleapis.com/drive/v3/files?*",
      (route) =>
        route.fulfill({
          json: { files: [{ id: "doc", name: "Disposable test document" }] },
        }),
    );
    await context.route(
      "https://docs.googleapis.com/v1/documents/**",
      async (route) => {
        if (route.request().method() === "GET") {
          await route.fulfill({
            json: {
              documentId: "doc",
              revisionId: `r${revision}`,
              tabs: [
                {
                  tabProperties: { tabId: "t.0" },
                  documentTab: {
                    body: {
                      content: [
                        { startIndex: 0, endIndex: 1, sectionBreak: {} },
                        {
                          startIndex: 1,
                          endIndex: remote.length + 2,
                          paragraph: {
                            elements: [
                              {
                                startIndex: 1,
                                endIndex: remote.length + 2,
                                textRun: { content: remote + "\n" },
                              },
                            ],
                          },
                        },
                      ],
                    },
                  },
                },
              ],
            },
          });
        } else {
          const body = route.request().postDataJSON();
          expect(body.writeControl.requiredRevisionId).toBe(`r${revision}`);
          for (const item of body.requests) {
            if (item.deleteContentRange) {
              const range = item.deleteContentRange.range;
              remote =
                remote.slice(0, range.startIndex - 1) +
                remote.slice(range.endIndex - 1);
            }
            if (item.insertText) {
              const insert = item.insertText;
              remote =
                remote.slice(0, insert.location.index - 1) +
                insert.text +
                remote.slice(insert.location.index - 1);
            }
          }
          revision++;
          writes++;
          if (loseAcknowledgement) {
            loseAcknowledgement = false;
            await route.fulfill({ status: 503, body: "Uncertain result" });
          } else await route.fulfill({ json: {} });
        }
      },
    );
    const page = await panelPage(context, id);
    await page
      .getByRole("button", { name: "Reconnect Google", exact: true })
      .waitFor();
    await page
      .getByRole("combobox", { name: "Authorized document", exact: true })
      .selectOption("doc");
    await page
      .getByRole("textbox", { name: "Your text", exact: true })
      .fill("Exact 😀 text.");
    await page
      .getByRole("combobox", { name: "Speed preset", exact: true })
      .selectOption("300");
    await page.getByRole("checkbox", { name: "I reviewed" }).check();
    await page
      .getByRole("button", { name: "Start writing", exact: true })
      .click();
    await expect(page.locator(".sync-state")).toContainText("Needs attention", {
      timeout: 25_000,
    });
    expect(remote).toBe("Exact 😀 text.");
    expect(writes).toBe(1);
    await page
      .getByRole("button", {
        name: "Reconcile & sync saved progress",
        exact: true,
      })
      .click();
    await expect(page.locator(".sync-state")).toContainText(
      "Complete · exact match verified",
    );
    expect(writes).toBe(1);
    // New writing cannot replace the result of the prior session.
    await page
      .getByRole("button", { name: "Start writing", exact: true })
      .click();
    await expect(
      page.getByRole("alert").filter({ hasText: "content changed" }),
    ).toBeVisible();
    expect(remote).toBe("Exact 😀 text.");
    // A new blank document changes externally after preflight; no automated overwrite.
    remote = "";
    revision++;
    await page
      .getByRole("textbox", { name: "Your text", exact: true })
      .fill("Fresh test.");
    await page.getByRole("checkbox", { name: "I reviewed" }).check();
    await page
      .getByRole("button", { name: "Start writing", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Pause", exact: true }),
    ).toBeVisible();
    remote = "Collaborator changed this.";
    revision++;
    await expect(page.locator(".sync-state")).toContainText("Needs attention", {
      timeout: 25_000,
    });
    expect(remote).toBe("Collaborator changed this.");
    expect(writes).toBe(1);
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});
