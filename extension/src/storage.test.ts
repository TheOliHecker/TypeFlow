import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { ExtensionStorage } from "./storage";
let saved: Record<string, string>;
let set: ReturnType<typeof vi.fn>;
beforeEach(() => {
  saved = {};
  set = vi.fn(async (values: Record<string, string>) => {
    Object.assign(saved, values);
  });
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: async () => ({ ...saved }),
        set,
        remove: async (keys: string[]) => {
          for (const key of keys) delete saved[key];
        },
      },
    },
  });
});
afterEach(() => vi.unstubAllGlobals());
it("durably saves checkpoints and removals and restores a fresh worker mirror", async () => {
  const storage = await ExtensionStorage.open();
  storage.setItem("checkpoint", "before");
  expect(saved.checkpoint).toBeUndefined();
  await storage.flush();
  expect((await ExtensionStorage.open()).getItem("checkpoint")).toBe("before");
  storage.removeItem("checkpoint");
  await storage.flush();
  expect((await ExtensionStorage.open()).getItem("checkpoint")).toBeNull();
});
it("does not acknowledge a failed barrier and retries all failed data before later writes", async () => {
  const storage = await ExtensionStorage.open();
  set.mockRejectedValueOnce(new Error("quota"));
  storage.setItem("engine", "checkpoint");
  const failed = storage.flush();
  storage.setItem("journal", "write-ahead");
  const next = storage.flush();
  await expect(failed).rejects.toThrow("storage failed");
  await next;
  expect(saved).toEqual({ engine: "checkpoint", journal: "write-ahead" });
});
it("keeps the newest checkpoint when a queued persistence attempt fails", async () => {
  const storage = await ExtensionStorage.open();
  let reject!: (e: Error) => void;
  set.mockImplementationOnce(
    () =>
      new Promise((_, no) => {
        reject = no;
      }),
  );
  storage.setItem("engine", "old");
  const failed = storage.flush();
  await vi.waitFor(() => expect(set).toHaveBeenCalled());
  storage.setItem("engine", "new");
  reject(new Error("disk"));
  await expect(failed).rejects.toThrow();
  await storage.flush();
  expect(saved.engine).toBe("new");
});
