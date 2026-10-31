/** Synchronous engine view with an explicit durable barrier before every remote write.
 * The owner Web Lock ensures panel/worker never use stale mirrors concurrently. */
export class ExtensionStorage implements Storage {
  private values = new Map<string, string>();
  private pending = new Map<string, string | null>();
  private chain: Promise<void> = Promise.resolve();
  static async open() {
    const storage = new ExtensionStorage();
    const saved = await chrome.storage.local.get(null);
    for (const [key, value] of Object.entries(saved))
      if (typeof value === "string") storage.values.set(key, value);
    return storage;
  }
  get length() {
    return this.values.size;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
    this.pending.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
    this.pending.set(key, null);
  }
  clear() {
    for (const key of this.values.keys()) this.removeItem(key);
  }
  flush = () => {
    const write = async () => {
      const changes = new Map(this.pending);
      this.pending.clear();
      const values: Record<string, string> = {};
      const removed: string[] = [];
      for (const [key, value] of changes)
        if (value === null) removed.push(key);
        else values[key] = value;
      try {
        if (Object.keys(values).length) await chrome.storage.local.set(values);
        if (removed.length) await chrome.storage.local.remove(removed);
      } catch {
        // Retain failed data for an explicit retry; newer values take precedence.
        for (const [key, value] of changes)
          if (!this.pending.has(key)) this.pending.set(key, value);
        throw new Error(
          "Device storage failed. Writing is paused. Free storage, then reconcile; export your text before clearing data.",
        );
      }
    };
    const result = this.chain.then(write);
    // The caller observes failures. A later flush may retry after storage recovers.
    this.chain = result.catch(() => {});
    return result;
  };
}
export const OWNER_LOCK = "typeflow-extension-owner-v1";
export const BACKGROUND = "typeflow-background-session";
export const BACKGROUND_ERROR = "typeflow-background-error";
