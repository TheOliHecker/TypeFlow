import { controlJob, readJob } from "./jobs";
import { SimulationEngine } from "../../src/lib/simulation/engine";
import { BrowserSessionStorage } from "../../src/lib/simulation/session";
import {
  GoogleDocsOutputAdapter,
  compileBatch,
} from "../../src/lib/google/adapter";
import {
  GoogleSyncCoordinator,
  newBinding,
  loadBinding,
  type SyncView,
} from "../../src/lib/google/sync";
import { createPlan } from "../../src/lib/simulation/plan";
import { approvedText } from "../../src/lib/simulation/proofreading";
import { DEFAULT_PROOFREADING, type Draft } from "../../src/lib/types";
import { extensionGoogleTransport } from "./google";
import { ExtensionStorage, BACKGROUND, BACKGROUND_ERROR } from "./storage";

export class PanelController {
  readonly engine = new SimulationEngine();
  readonly sessions: BrowserSessionStorage;
  sync?: GoogleSyncCoordinator;
  view: SyncView = { status: "Ready", confirmedCharacters: 0, pending: 0 };
  private listeners = new Set<() => void>();
  private failure = "";
  get storageError() {
    return this.failure;
  }
  constructor(readonly storage: ExtensionStorage) {
    this.sessions = new BrowserSessionStorage(storage);
    this.engine.setCheckpointWriter((saved) => {
      this.sessions.save(saved);
      void storage.flush().catch(() => {
        this.failure =
          "Checkpoint storage failed. Writing is paused. Export your preview, free storage, then reconcile.";
        this.engine.pause();
        this.sync?.pause();
        this.notify();
      });
    });
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private notify() {
    for (const fn of this.listeners) fn();
  }
  private attach(id: string) {
    const binding = loadBinding(this.storage, id);
    if (!binding) throw new Error("This session has no Google checkpoint.");
    this.sync?.dispose();
    this.sync = new GoogleSyncCoordinator(
      this.engine,
      this.storage,
      extensionGoogleTransport,
      binding,
      (view) => {
        this.view = view;
        this.notify();
      },
      undefined,
      30_000,
      this.storage.flush,
    );
    return this.sync.initialize();
  }
  async start(
    draft: Draft,
    documentId: string,
    google: boolean,
    background: boolean,
  ) {
    if (["running", "paused"].includes(this.engine.getSnapshot().status))
      throw new Error("Stop the current session before starting another.");
    const job = await readJob();
    if (job && !["complete", "cancelled"].includes(job.status))
      throw new Error(
        "Cancel the scheduled job before starting another session.",
      );
    const options = {
      finalText: draft.mode === "two" ? (draft.finalText ?? "") : undefined,
      finalSettings: draft.finalSettings,
      revisionMode: draft.revisionMode,
      proofreading: draft.proofreading,
    };
    createPlan(draft.text, draft.settings, undefined, options);
    if (google) {
      if (!documentId)
        throw new Error("Create or select a blank authorized document first.");
      for (const text of [
        draft.text,
        approvedText(
          options.finalText ?? draft.text,
          draft.proofreading ?? DEFAULT_PROOFREADING,
        ),
      ])
        compileBatch("", [{ type: "insert", index: 0, text }]);
      await new GoogleDocsOutputAdapter(extensionGoogleTransport).initialize({
        documentId,
        text: "",
      });
    }
    if (["running", "paused"].includes(this.engine.getSnapshot().status))
      throw new Error(
        "A session is already active. Stop it before starting another.",
      );
    this.sync?.dispose();
    this.sync = undefined;
    this.failure = "";
    this.engine.start(draft.text, draft.settings, draft.title, options);
    this.engine.pause();
    if (this.engine.getSnapshot().storageError)
      throw new Error(this.engine.getSnapshot().storageError);
    const id = this.engine.getMetadata()!.id;
    if (google) {
      this.storage.setItem(
        `typeflow-google-v1:${id}`,
        JSON.stringify(newBinding(id, documentId)),
      );
      await this.storage.flush();
      await this.attach(id);
    }
    if (google && background) this.storage.setItem(BACKGROUND, id);
    else this.storage.removeItem(BACKGROUND);
    await this.storage.flush();
    this.engine.resume();
  }
  async recover(id: string) {
    if (["running", "paused"].includes(this.engine.getSnapshot().status))
      throw new Error("Stop the current session before restoring another.");
    const saved = this.sessions.load(id);
    if (!saved) throw new Error("Saved session is unavailable.");
    this.engine.recover(saved);
    const binding = loadBinding(this.storage, id);
    if (binding) await this.attach(id);
    else {
      this.sync?.dispose();
      this.sync = undefined;
    }
    this.storage.removeItem(BACKGROUND);
    await this.storage.flush();
    return { saved, documentId: binding?.documentId };
  }
  async reconcile() {
    this.failure = "";
    await this.storage.flush();
    await this.sync?.recover();
    this.storage.removeItem(BACKGROUND_ERROR);
    await this.storage.flush();
  }
  async resume(background: boolean) {
    if (this.sync) await this.reconcile();
    if (this.sync && background)
      this.storage.setItem(BACKGROUND, this.engine.getMetadata()!.id);
    await this.storage.flush();
    this.engine.resume();
  }
  async pause(stop = false) {
    this.storage.removeItem(BACKGROUND);
    this.sync?.pause();
    if (stop) this.engine.stop();
    else this.engine.pause();
    await this.storage.flush();
  }
  async erase() {
    await controlJob("cancel");
    await this.pause(true);
    this.sync?.dispose();
    this.sync = undefined;
    this.engine.reset();
    this.storage.clear();
    await this.storage.flush();
    await chrome.storage.local.clear();
  }
  async discard(id: string) {
    const binding = loadBinding(this.storage, id);
    if (binding?.pending)
      throw new Error(
        "This session has an uncertain Google write. Restore and reconcile before discarding its checkpoint.",
      );
    if (this.engine.getMetadata()?.id === id) {
      await this.pause(true);
      this.sync?.dispose();
      this.sync = undefined;
      this.engine.reset();
    }
    this.sessions.delete(id);
    this.storage.removeItem(`typeflow-google-v1:${id}`);
    await this.storage.flush();
  }
}
