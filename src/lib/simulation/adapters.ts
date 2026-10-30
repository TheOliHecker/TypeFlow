import {
  applyOperation,
  type EditingOperation,
  type OutputAdapter,
} from "./operations";

export type DocumentState = {
  text: string;
  revision?: string;
  documentId?: string;
  cursor?: number;
  selection?: { index: number; end: number };
};
export type AdapterCapabilities = {
  operations: readonly EditingOperation["type"][];
  read: boolean;
  cancel: boolean;
  revisionTokens: boolean;
  batch: boolean;
};
export type OperationReceipt = {
  operationId: string;
  acknowledgedAt: number;
  state: DocumentState;
};
export interface DocumentAdapter extends OutputAdapter {
  readonly capabilities: AdapterCapabilities;
  initialize(document: {
    documentId?: string;
    text?: string;
  }): Promise<DocumentState>;
  readState(): Promise<DocumentState>;
  execute(
    operation: EditingOperation,
    context: {
      operationId: string;
      expectedRevision?: string;
      signal: AbortSignal;
    },
  ): Promise<OperationReceipt>;
  verify(expected: string): Promise<boolean>;
  cancelPending(): Promise<void>;
  applyBatch?(
    operations: readonly { id: string; operation: EditingOperation }[],
    signal: AbortSignal,
  ): Promise<readonly OperationReceipt[]>;
}
export class PreviewAdapter implements DocumentAdapter {
  readonly capabilities: AdapterCapabilities = {
    operations: [
      "insert",
      "delete",
      "replace",
      "select",
      "move",
      "pause",
      "stage",
      "verify",
    ],
    read: true,
    cancel: true,
    revisionTokens: true,
    batch: false,
  };
  private state: DocumentState = { text: "", revision: "0" };
  async initialize(document: { documentId?: string; text?: string }) {
    this.state = {
      text: document.text ?? "",
      documentId: document.documentId,
      revision: "0",
    };
    return this.readState();
  }
  async readState() {
    return structuredClone(this.state);
  }
  async readText() {
    return this.state.text;
  }
  async apply(operation: EditingOperation) {
    const cursor =
      "index" in operation
        ? operation.type === "select"
          ? operation.end
          : operation.index + ("text" in operation ? operation.text.length : 0)
        : this.state.cursor;
    this.state = {
      ...this.state,
      cursor,
      selection:
        operation.type === "select"
          ? { index: operation.index, end: operation.end }
          : undefined,
      text: applyOperation(this.state.text, operation),
      revision: String(Number(this.state.revision) + 1),
    };
  }
  async execute(
    operation: EditingOperation,
    context: {
      operationId: string;
      expectedRevision?: string;
      signal: AbortSignal;
    },
  ) {
    if (context.signal.aborted)
      throw new Error("Operation cancelled before execution.");
    if (
      context.expectedRevision !== undefined &&
      context.expectedRevision !== this.state.revision
    )
      throw new Error("Document revision conflict.");
    await this.apply(operation);
    return {
      operationId: context.operationId,
      acknowledgedAt: Date.now(),
      state: await this.readState(),
    };
  }
  async verify(expected: string) {
    return this.state.text === expected;
  }
  async cancelPending() {}
}

export type OperationState =
  | "planned"
  | "ready"
  | "in-flight"
  | "confirmed"
  | "failed"
  | "requires-reconciliation";
export type WriteAhead = {
  id: string;
  operation: EditingOperation;
  state: OperationState;
  before: DocumentState;
  afterText: string;
  plannedAt: number;
  executedAt?: number;
  synchronizedAt?: number;
  error?: string;
};
/** The journal must durably acknowledge save BEFORE any external write. */
export interface OperationJournal {
  load(id: string): Promise<WriteAhead | null>;
  save(record: WriteAhead): Promise<void>;
}

/** Serialized external execution. Ambiguous results block subsequent writes.
 * Full before/after comparison is deliberately conservative: unrelated external
 * edits require attention rather than a guessed insertion/deletion retry.
 */
export class AdapterExecutor {
  private busy = false;
  private stopped = false;
  private uncertain = false;
  private controller = new AbortController();
  constructor(
    private adapter: DocumentAdapter,
    private journal: OperationJournal,
    private timeoutMs = 15000,
  ) {}
  pause() {
    this.stop();
  }
  stop() {
    this.stopped = true;
    this.controller.abort();
    // This requests cancellation; a committed remote write may still complete.
    if (this.adapter.capabilities.cancel)
      void this.adapter.cancelPending().catch(() => {});
  }
  resume() {
    if (this.busy || this.uncertain)
      throw new Error("Reconcile pending work before resuming.");
    this.stopped = false;
    this.controller = new AbortController();
  }
  async reconcile(record: WriteAhead): Promise<WriteAhead> {
    if (!this.adapter.capabilities.read)
      throw new Error(
        "Uncertain write requires manual reconciliation; adapter cannot read.",
      );
    const current = await this.adapter.readState();
    if (
      (record.operation.type === "move" && current.cursor === undefined) ||
      (record.operation.type === "select" && current.selection === undefined)
    )
      throw new Error(
        "Adapter cannot reconcile cursor or selection; requires attention.",
      );
    const positionMatches =
      record.operation.type === "move"
        ? current.cursor === record.operation.index
        : record.operation.type === "select"
          ? current.selection?.index === record.operation.index &&
            current.selection?.end === record.operation.end
          : true;
    if (current.text === record.afterText && positionMatches) {
      record = { ...record, state: "confirmed", synchronizedAt: Date.now() };
    } else if (current.text === record.before.text) {
      if (
        !this.adapter.capabilities.revisionTokens ||
        current.revision === undefined
      )
        throw new Error(
          "Write may still complete. Safe retry requires conditional revision tokens or manual reconciliation.",
        );
      record = { ...record, state: "ready", before: current };
    } else {
      throw new Error(
        "Document conflict: uncertain write differs from both checkpoints.",
      );
    }
    await this.journal.save(record);
    this.uncertain = false;
    return record;
  }
  async execute(
    id: string,
    operation: EditingOperation,
    plannedAt: number,
    previous?: WriteAhead,
  ): Promise<WriteAhead> {
    if (this.stopped || this.busy || this.uncertain)
      throw new Error("Executor stopped, busy, or requires reconciliation.");
    this.busy = true;
    let record: WriteAhead | undefined;
    try {
      previous = (await this.journal.load(id)) ?? previous;
      if (
        previous &&
        (previous.id !== id ||
          JSON.stringify(previous.operation) !== JSON.stringify(operation))
      )
        throw new Error("Operation identity mismatch.");
      if (
        previous &&
        (previous.state === "in-flight" ||
          previous.state === "requires-reconciliation")
      )
        previous = await this.reconcile(previous);
      if (previous?.state === "confirmed") return previous;
      if (this.stopped) throw new Error("Executor stopped.");
      if (!this.adapter.capabilities.read)
        throw new Error("Safe execution requires document reads.");
      const before = await this.adapter.readState();
      if (previous && before.text !== previous.before.text)
        throw new Error(
          "Document changed before retry; reconcile before writing.",
        );
      if (
        this.adapter.capabilities.revisionTokens &&
        before.revision === undefined
      )
        throw new Error(
          "Adapter advertised revision tokens but returned none.",
        );
      const afterText = applyOperation(before.text, operation);
      const supported = this.adapter.capabilities.operations.includes(
        operation.type,
      );
      // Verification can fall back to a read. Cursor movement and destructive
      // edits have no pretend-success fallback. Replace requires native support.
      if (
        !supported &&
        !(operation.type === "verify" && this.adapter.capabilities.read)
      )
        throw new Error(`Adapter does not support ${operation.type}.`);
      record = {
        id,
        operation,
        before,
        afterText,
        plannedAt,
        state: "in-flight",
        executedAt: Date.now(),
      };
      await this.journal.save(record);
      if (this.stopped) {
        record = { ...record, state: "ready" };
        await this.journal.save(record);
        return record;
      }
      let timeout: ReturnType<typeof setTimeout> | undefined;
      let receipt: OperationReceipt;
      try {
        receipt = await Promise.race([
          supported
            ? this.adapter.execute(operation, {
                operationId: id,
                expectedRevision: before.revision,
                signal: this.controller.signal,
              })
            : Promise.resolve({
                operationId: id,
                acknowledgedAt: Date.now(),
                state: before,
              }),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => {
              this.controller.abort();
              reject(
                new Error(
                  "Write timed out; its remote outcome is uncertain. Reconcile before retrying.",
                ),
              );
            }, this.timeoutMs);
          }),
        ]);
      } finally {
        if (timeout !== undefined) clearTimeout(timeout);
      }

      if (
        receipt.operationId !== id ||
        receipt.state.text !== afterText ||
        (operation.type === "move" &&
          receipt.state.cursor !== operation.index) ||
        (operation.type === "select" &&
          (receipt.state.selection?.index !== operation.index ||
            receipt.state.selection?.end !== operation.end))
      )
        throw new Error(
          "Adapter acknowledgement does not match the operation.",
        );
      record = {
        ...record,
        state: "confirmed",
        synchronizedAt: receipt.acknowledgedAt,
      };
      await this.journal.save(record);
      return record;
    } catch (error) {
      if (record) {
        this.uncertain = true;
        this.stopped = true;
        record = {
          ...record,
          state: "requires-reconciliation",
          error: (error as Error).message,
        };
        await this.journal.save(record);
      }
      throw error;
    } finally {
      this.busy = false;
    }
  }
}
