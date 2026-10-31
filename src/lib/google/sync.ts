import {
  AdapterExecutor,
  type OperationJournal,
  type WriteAhead,
} from "../simulation/adapters";
import {
  applyOperation,
  eventOperation,
  type EditingOperation,
} from "../simulation/operations";
import type { SimulationEngine } from "../simulation/engine";
import { ForegroundScheduler, type Scheduler } from "../simulation/scheduler";
import {
  GoogleDocsOutputAdapter,
  type GoogleTransport,
  type SyncActivity,
} from "./adapter";

type Pending = {
  id: string;
  end: number;
  operation: EditingOperation;
  batch: { id: string; operation: EditingOperation }[];
};
export type GoogleBinding = {
  version: 1;
  sessionId: string;
  documentId: string;
  confirmedText: string;
  confirmedIndex: number;
  lastSync?: number;
  pending?: Pending;
  complete?: boolean;
  activity: SyncActivity[];
};
export type SyncView = {
  status: string;
  error?: string;
  confirmedCharacters: number;
  pending: number;
  lastSync?: number;
};
const key = (id: string) => `typeflow-google-v1:${id}`;
export function loadBinding(
  storage: Storage,
  id: string,
): GoogleBinding | null {
  const raw = storage.getItem(key(id));
  if (!raw) return null;
  const b = JSON.parse(raw) as GoogleBinding;
  if (
    b.version !== 1 ||
    b.sessionId !== id ||
    typeof b.documentId !== "string" ||
    typeof b.confirmedText !== "string" ||
    !Number.isInteger(b.confirmedIndex) ||
    b.confirmedIndex < 0 ||
    !Array.isArray(b.activity)
  )
    throw new Error(
      "Invalid Google recovery checkpoint. Inspect the Google document before starting another session.",
    );
  return b;
}
/** Uses the existing journal/executor; the binding only stores remote progress. */
export class GoogleSyncCoordinator {
  private binding: GoogleBinding;
  private adapter: GoogleDocsOutputAdapter;
  private executor: AdapterExecutor;
  private busy = false;
  private paused = true;
  private failed = false;
  private disposed = false;
  private unsubscribe: () => void;
  private journal: OperationJournal;
  private lastStage = "";
  constructor(
    private engine: SimulationEngine,
    private storage: Storage,
    transport: GoogleTransport,
    binding: GoogleBinding,
    private update: (view: SyncView) => void,
    private scheduler: Scheduler = new ForegroundScheduler(),
    private intervalMs = 30_000,
    private durable: () => Promise<void> = async () => {},
  ) {
    this.binding = structuredClone(binding);
    this.journal = {
      load: async (id) => {
        const raw = storage.getItem(`typeflow-google-journal:${id}`);
        return raw ? (JSON.parse(raw) as WriteAhead) : null;
      },
      save: async (record) => {
        storage.setItem(
          `typeflow-google-journal:${record.id}`,
          JSON.stringify(record),
        );
        await this.durable();
      },
    };
    this.adapter = new GoogleDocsOutputAdapter(transport, {
      sessionId: binding.sessionId,
      activity: (entry) => {
        this.binding.activity = [...this.binding.activity.slice(-199), entry];
        this.save();
      },
    });
    this.executor = new AdapterExecutor(this.adapter, this.journal, 150_000);
    this.unsubscribe = engine.subscribe(() => this.onEngine());
  }
  private save() {
    this.storage.setItem(
      key(this.binding.sessionId),
      JSON.stringify(this.binding),
    );
  }
  private view(status: string, error?: string) {
    if (this.disposed) return;
    this.update({
      status,
      error,
      confirmedCharacters: this.binding.confirmedText.length,
      pending: Math.max(
        0,
        (this.engine.getOutputProgress().index ?? 0) -
          this.binding.confirmedIndex,
      ),
      lastSync: this.binding.lastSync,
    });
  }
  async initialize() {
    this.view("Recovering");
    try {
      const checkpoint = this.engine.getOutputCheckpoint();
      if (
        !checkpoint ||
        checkpoint.sessionId !== this.binding.sessionId ||
        this.binding.confirmedIndex > checkpoint.index
      )
        throw new Error(
          "Google recovery does not match the saved local session.",
        );
      let confirmed = "";
      for (const event of checkpoint.events.slice(
        0,
        this.binding.confirmedIndex,
      ))
        confirmed = applyOperation(confirmed, eventOperation(event));
      if (confirmed !== this.binding.confirmedText)
        throw new Error(
          "Google confirmed progress differs from the saved engine plan.",
        );
      if (this.binding.pending) {
        const pending = this.binding.pending;
        if (
          !Number.isInteger(pending.end) ||
          pending.end <= this.binding.confirmedIndex ||
          pending.end > checkpoint.index ||
          !Array.isArray(pending.batch)
        )
          throw new Error("Invalid pending Google recovery batch.");
        const expected = checkpoint.events
          .slice(this.binding.confirmedIndex, pending.end)
          .map((event, offset) => ({
            id: `${checkpoint.sessionId}:${event.id ?? this.binding.confirmedIndex + offset}`,
            operation: eventOperation(event),
          }));
        if (JSON.stringify(expected) !== JSON.stringify(pending.batch))
          throw new Error(
            "Pending Google operation identities differ from the saved engine plan.",
          );
        let after = confirmed;
        for (const item of pending.batch)
          after = applyOperation(after, item.operation);
        if (applyOperation(confirmed, pending.operation) !== after)
          throw new Error("Pending Google batch differs from its checkpoint.");
      }
      const remote = await this.adapter.initialize({
        documentId: this.binding.documentId,
      });
      if (this.binding.pending) {
        const pending = this.binding.pending,
          record = await this.journal.load(pending.id);
        if (record) {
          const result = await this.executor.reconcile(record);
          if (result.state === "confirmed")
            this.confirm(pending, result.afterText);
          else if (remote.text !== this.binding.confirmedText)
            throw new Error(
              "Google recovery conflict. External changes need attention.",
            );
        } else if (remote.text !== this.binding.confirmedText)
          throw new Error(
            "Google document differs from the last confirmed checkpoint.",
          );
      } else if (remote.text !== this.binding.confirmedText)
        throw new Error(
          "Google document changed outside TypeFlow. No changes were overwritten.",
        );
      this.save();
      await this.durable();
      this.failed = false;
      this.view(
        this.binding.complete ? "Complete · exact match verified" : "Ready",
      );
    } catch (e) {
      this.fail(e);
      throw e;
    }
  }
  private confirm(pending: Pending, text: string) {
    this.binding.confirmedText = text;
    this.binding.confirmedIndex = pending.end;
    this.binding.lastSync = Date.now();
    this.binding.pending = undefined;
    this.save();
    this.storage.removeItem(`typeflow-google-journal:${pending.id}`);
  }
  private fail(error: unknown) {
    if (this.disposed) return;
    this.failed = true;
    this.paused = true;
    this.scheduler.cancel();
    this.engine.pause();
    this.view("Needs attention", (error as Error).message);
  }
  private onEngine() {
    if (this.failed || this.disposed) return;
    const s = this.engine.getSnapshot();
    if (
      s.status === "paused" ||
      s.status === "stopped" ||
      s.status === "error" ||
      s.status === "idle"
    ) {
      this.paused = true;
      this.executor.pause();
      this.scheduler.cancel();
      this.view(s.status === "paused" ? "Paused" : "Stopped");
      return;
    }
    if (this.paused) {
      try {
        this.executor.resume();
      } catch (error) {
        this.fail(error);
        return;
      }
      this.paused = false;
      this.scheduler.schedule(
        this.scheduler.now() + this.intervalMs,
        () => void this.flush(),
      );
    }
    // Stage boundaries preserve Draft 1 before revision writes begin.
    const stageChanged = this.lastStage && this.lastStage !== s.stage;
    this.lastStage = s.stage;
    if (!this.busy && (s.status === "completed" || stageChanged))
      void this.flush();
    else if (!this.busy) this.view("Writing");
  }
  pause() {
    this.paused = true;
    this.executor.pause();
    this.scheduler.cancel();
    this.view(
      "Paused",
      this.busy
        ? "A Google request is in flight and may still complete."
        : undefined,
    );
  }
  async recover() {
    if (this.busy)
      throw new Error(
        "A Google request is still in flight. Wait before recovering.",
      );
    await this.initialize();
    this.executor.resume();
    if (this.engine.getSnapshot().status === "completed") {
      this.paused = false;
      await this.flush();
    }
  }
  private async flush() {
    if (this.busy || this.paused || this.failed || this.disposed) return;
    this.busy = true;
    this.scheduler.cancel();
    this.view("Synchronizing");
    try {
      this.engine.checkpoint();
      await this.durable();
      if (this.engine.getSnapshot().storageError)
        throw new Error(
          "Save the local checkpoint before synchronizing: " +
            this.engine.getSnapshot().storageError,
        );
      const checkpoint = this.engine.getOutputCheckpoint();
      if (!checkpoint || checkpoint.sessionId !== this.binding.sessionId)
        throw new Error(
          "Google session identity changed. Recover the original session.",
        );
      if (
        !this.binding.pending &&
        checkpoint.index > this.binding.confirmedIndex
      ) {
        let end = Math.min(checkpoint.index, this.binding.confirmedIndex + 180);
        // Do not combine the end of Draft 1 with the beginning of its revision.
        const nextStage = checkpoint.events.findIndex(
          (event, i) =>
            i > this.binding.confirmedIndex &&
            i < end &&
            event.type === "stage",
        );
        if (nextStage >= 0) end = nextStage;
        let after = this.binding.confirmedText;
        const batch = checkpoint.events
          .slice(this.binding.confirmedIndex, end)
          .map((event, offset) => ({
            id: `${checkpoint.sessionId}:${event.id ?? this.binding.confirmedIndex + offset}`,
            operation: eventOperation(event),
          }));
        for (const item of batch) after = applyOperation(after, item.operation);
        this.binding.pending = {
          id: `${checkpoint.sessionId}:google:${this.binding.confirmedIndex}-${end}`,
          end,
          batch,
          operation: {
            type: "replace",
            index: 0,
            expected: this.binding.confirmedText,
            text: after,
          },
        };
        this.save(); // persist exact batch before executor journaling and external write
        await this.durable();
      }
      const pending = this.binding.pending;
      if (pending) {
        const result = await this.executor.execute(
          pending.id,
          pending.operation,
          Date.now(),
          undefined,
          pending.batch,
        );
        if (result.state === "confirmed")
          this.confirm(pending, result.afterText);
      }
      if (
        !this.paused &&
        !this.disposed &&
        (this.engine.getSnapshot().status === "completed" ||
          (checkpoint.snapshot.progress === 100 &&
            checkpoint.events.at(-1)?.type === "verify")) &&
        this.binding.confirmedIndex === checkpoint.index
      ) {
        const verification = await this.adapter.verifyFinal(checkpoint.target);
        if (!verification.match)
          throw new Error(
            `${verification.explanation} Inspect external changes, then recover; no content was overwritten to force a match.`,
          );
        this.binding.complete = true;
        this.save();
        this.view("Complete · exact match verified");
      } else
        this.view(
          this.paused
            ? "Paused / stopped · an in-flight request may have completed"
            : "Writing",
        );
    } catch (error) {
      this.fail(error);
    } finally {
      this.busy = false;
      try {
        await this.durable();
      } catch (error) {
        this.fail(error);
      }
      if (
        !this.paused &&
        !this.failed &&
        !this.binding.complete &&
        !this.disposed
      ) {
        // Drain bounded backlog at controlled request spacing; normal cadence is 30s.
        const backlog =
          (this.engine.getOutputProgress().index ?? 0) -
          this.binding.confirmedIndex;
        this.scheduler.schedule(
          this.scheduler.now() + (backlog ? 2500 : this.intervalMs),
          () => void this.flush(),
        );
      }
    }
  }
  /** Drain one durable checkpoint without running the writing clock. Used by MV3 alarms. */
  async synchronizeCheckpoint() {
    if (this.busy || this.failed || this.disposed)
      throw new Error("Reconcile synchronization before continuing.");
    this.executor.resume();
    this.paused = false;
    try {
      await this.flush();
    } finally {
      this.paused = true;
      this.scheduler.cancel();
    }
    if (this.failed)
      throw new Error(
        "Synchronization needs attention. Reopen TypeFlow and reconcile.",
      );
    return (
      this.binding.complete === true ||
      this.binding.confirmedIndex === this.engine.getOutputProgress().index
    );
  }
  dispose() {
    this.executor.stop();
    this.disposed = true;
    this.paused = true;
    this.scheduler.cancel();
    this.unsubscribe();
  }
}
export function newBinding(
  sessionId: string,
  documentId: string,
): GoogleBinding {
  return {
    version: 1,
    sessionId,
    documentId,
    confirmedText: "",
    confirmedIndex: 0,
    activity: [],
  };
}
