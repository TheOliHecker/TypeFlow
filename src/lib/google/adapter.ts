import type {
  DocumentAdapter,
  DocumentState,
  OperationReceipt,
} from "../simulation/adapters";
import {
  applyOperation,
  type EditingOperation,
} from "../simulation/operations";

export interface GoogleTransport {
  request(
    action: "create" | "read" | "batch",
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown>;
}
export class GoogleApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryAfterMs = 0,
  ) {
    super(message);
  }
}
export const webGoogleTransport: GoogleTransport = {
  async request(action, body, signal) {
    const response = await fetch(`/api/google/${action}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-TypeFlow-Request": "1",
      },
      body: JSON.stringify(body),
      signal,
    });
    const data = await response.json();
    if (!response.ok)
      throw new GoogleApiError(
        data.error ?? "Google request failed.",
        response.status,
        Math.min(
          60_000,
          Math.max(0, Number(response.headers.get("retry-after")) || 0) * 1000,
        ),
      );
    return data;
  },
};

type Element = {
  startIndex?: number;
  endIndex?: number;
  paragraph?: {
    elements?: {
      startIndex?: number;
      endIndex?: number;
      textRun?: { content?: string };
      [key: string]: unknown;
    }[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
};
type Body = { content?: Element[] };
type Tab = {
  tabProperties?: { tabId?: string };
  childTabs?: Tab[];
  documentTab?: { body?: Body; [key: string]: unknown };
};
export type GoogleDocument = {
  documentId?: string;
  revisionId?: string;
  body?: Body;
  tabs?: Tab[];
  [key: string]: unknown;
};
/** Only an unambiguous, contiguous, plain-text document is supported. */
export function extractDocument(
  doc: GoogleDocument,
): DocumentState & { tabId?: string } {
  if (!doc.documentId || !doc.revisionId)
    throw new Error("Google returned no document ID or revision.");
  if (
    doc.suggestionsViewMode === "PREVIEW_WITHOUT_SUGGESTIONS" ||
    doc.suggestedDocumentStyleChanges
  )
    throw new Error("Unsupported suggested document changes.");
  let body = doc.body,
    tabId: string | undefined;
  if (doc.tabs?.length) {
    if (doc.tabs.length !== 1 || doc.tabs[0].childTabs?.length)
      throw new Error(
        "Unsupported document: multiple or nested tabs. Use a plain-text document created by TypeFlow.",
      );
    const tab = doc.tabs[0];
    tabId = tab.tabProperties?.tabId;
    body = tab.documentTab?.body;
    if (
      !tabId ||
      Object.keys(tab.documentTab ?? {}).some(
        (k) =>
          [
            "headers",
            "footers",
            "footnotes",
            "inlineObjects",
            "positionedObjects",
          ].includes(k) &&
          Object.keys((tab.documentTab![k] as object) ?? {}).length,
      )
    )
      throw new Error("Unsupported document structure.");
  }
  if (!body?.content)
    throw new Error("Unsupported document: missing plain-text body.");
  let text = "",
    next = 1;
  for (const block of body.content) {
    if (
      "sectionBreak" in block &&
      (block.startIndex ?? 0) === 0 &&
      block.endIndex === 1 &&
      next === 1 &&
      text === ""
    )
      continue;
    if (
      !block.paragraph ||
      block.startIndex !== next ||
      block.paragraph.bullet ||
      block.paragraph.positionedObjectIds
    )
      throw new Error(
        "Unsupported document: tables, lists, sections, or non-contiguous text.",
      );
    for (const element of block.paragraph.elements ?? []) {
      if (
        Object.keys(element).some((k) => k.startsWith("suggested")) ||
        !element.textRun ||
        element.startIndex !== next ||
        typeof element.textRun.content !== "string"
      )
        throw new Error(
          "Unsupported document: embedded objects or suggested edits.",
        );
      text += element.textRun.content;
      next += element.textRun.content.length;
      if (element.endIndex !== next)
        throw new Error("Unsupported Google UTF-16 text range.");
    }
    if (block.endIndex !== next)
      throw new Error("Unsupported paragraph range.");
  }
  if (!text.endsWith("\n"))
    throw new Error(
      "Unsupported document: missing terminal paragraph boundary.",
    );
  return {
    documentId: doc.documentId,
    revision: doc.revisionId,
    text: text.slice(0, -1),
    tabId,
  };
}
export function compileBatch(
  before: string,
  operations: readonly EditingOperation[],
  tabId?: string,
) {
  let text = before;
  const requests: Record<string, unknown>[] = [];
  for (const op of operations) {
    if (op.type === "move" || op.type === "select")
      throw new Error(
        "Unsupported operation: Google Docs REST cannot acknowledge a visible cursor or selection.",
      );
    const after = applyOperation(text, op);
    if (op.type === "delete" || op.type === "replace") {
      if (op.expected.length)
        requests.push({
          deleteContentRange: {
            range: {
              startIndex: op.index + 1,
              endIndex: op.index + 1 + op.expected.length,
              ...(tabId ? { tabId } : {}),
            },
          },
        });
    }
    if ((op.type === "insert" || op.type === "replace") && op.text) {
      // Google strips certain controls instead of faithfully inserting them.
      if (
        /[\u0000-\u0008\u000c-\u001f\ue000-\uf8ff]/u.test(op.text) ||
        Array.from(op.text).some(
          (c) => c.length === 1 && /[\ud800-\udfff]/u.test(c),
        )
      )
        throw new Error(
          "Unsupported control or private-use characters in approved text.",
        );
      requests.push({
        insertText: {
          location: { index: op.index + 1, ...(tabId ? { tabId } : {}) },
          text: op.text,
        },
      });
    }
    text = after;
  }
  if (requests.length > 400 || JSON.stringify(requests).length > 400_000)
    throw new Error(
      "Editing batch too large. Reduce the pending checkpoint size.",
    );
  return { requests, text };
}
/** Returns diagnostic counts only, never excerpts from private document text. */
export function compareFinalText(actual: string, expected: string) {
  if (actual === expected)
    return { match: true, explanation: "Exact match verified." };
  let first = 0;
  while (
    first < actual.length &&
    first < expected.length &&
    actual[first] === expected[first]
  )
    first++;
  const whitespaceOnly =
    actual.replace(/\s/gu, "") === expected.replace(/\s/gu, "");
  const punctuationOnly =
    actual.replace(/[\s\p{P}]/gu, "") === expected.replace(/[\s\p{P}]/gu, "");
  const reordered =
    actual.split("\n").sort().join("\n") ===
    expected.split("\n").sort().join("\n");
  const detail = whitespaceOnly
    ? "Whitespace differs."
    : punctuationOnly
      ? "Punctuation or whitespace differs."
      : reordered
        ? "Paragraph ordering differs."
        : actual.length < expected.length
          ? "Content is missing or changed."
          : actual.length > expected.length
            ? "There is extra, duplicated, or changed content."
            : "Content or ordering differs.";
  return {
    match: false,
    explanation: `${detail} Google: ${actual.length} UTF-16 units; approved: ${expected.length}. First difference at offset ${first}.`,
  };
}
export type SyncActivity = {
  sessionId: string;
  documentId: string;
  batchId: string;
  initiatedAt: number;
  completedAt: number;
  outcome: "acknowledged" | "failed";
  retryCount: number;
  errorCode?: number;
  confirmedCharacters?: number;
  requests: {
    initiatedAt: number;
    completedAt: number;
    outcome: "acknowledged" | "failed";
    errorCode?: number;
  }[];
};
/** Portable API adapter: authentication is supplied by the host transport. */
export class GoogleDocsOutputAdapter implements DocumentAdapter {
  readonly capabilities = {
    operations: [
      "insert",
      "delete",
      "replace",
      "pause",
      "stage",
      "verify",
    ] as const,
    read: true,
    cancel: false,
    revisionTokens: true,
    batch: true,
  };
  private documentId = "";
  private expected?: DocumentState;
  private busy = false;
  private lastWrite = 0;
  constructor(
    private transport: GoogleTransport,
    private options: {
      minWriteIntervalMs?: number;
      maxAttempts?: number;
      sessionId?: string;
      activity?: (entry: SyncActivity) => void;
    } = {},
  ) {}
  async create(title: string) {
    const doc = (await this.transport.request("create", {
      title,
    })) as GoogleDocument;
    if (!doc.documentId)
      throw new Error("Google did not return a document ID.");
    return this.initialize({ documentId: doc.documentId, text: "" });
  }
  async initialize(document: { documentId?: string; text?: string }) {
    if (!document.documentId)
      throw new Error("Create or recover a Google Doc first.");
    this.documentId = document.documentId;
    const state = await this.readState();
    if (document.text !== undefined && state.text !== document.text)
      throw new Error(
        "Document content changed. No external changes were overwritten.",
      );
    this.expected = state;
    return state;
  }
  async readState() {
    if (!this.documentId)
      throw new Error("Google document is not initialized.");
    return extractDocument(
      (await this.transport.request("read", {
        documentId: this.documentId,
      })) as GoogleDocument,
    );
  }
  async readText() {
    return (await this.readState()).text;
  }
  async verifyFinal(expected: string) {
    return compareFinalText((await this.readState()).text, expected);
  }
  async verify(expected: string) {
    return (await this.verifyFinal(expected)).match;
  }
  async cancelPending() {
    /* An HTTP write may commit even after local cancellation. */
  }
  async apply(op: EditingOperation) {
    await this.execute(op, {
      operationId: crypto.randomUUID(),
      signal: new AbortController().signal,
    });
  }
  async execute(
    op: EditingOperation,
    context: {
      operationId: string;
      expectedRevision?: string;
      signal: AbortSignal;
    },
  ) {
    return (
      await this.write(
        [{ id: context.operationId, operation: op }],
        context.signal,
        context.expectedRevision,
      )
    )[0];
  }
  async applyBatch(
    operations: readonly { id: string; operation: EditingOperation }[],
    signal: AbortSignal,
  ) {
    return this.write(operations, signal);
  }
  private async write(
    operations: readonly { id: string; operation: EditingOperation }[],
    signal: AbortSignal,
    expectedRevision?: string,
  ): Promise<OperationReceipt[]> {
    if (this.busy) throw new Error("Google write queue is busy.");
    this.busy = true;
    let retryCount = 0;
    const initiatedAt = Date.now();
    let errorCode: number | undefined;
    const requests: SyncActivity["requests"] = [];
    try {
      const before = await this.readState();
      if (
        (this.expected && this.expected.text !== before.text) ||
        (expectedRevision && expectedRevision !== before.revision)
      )
        throw new Error(
          "Google document conflict. A collaborator changed the document; automated writing is paused.",
        );
      const compiled = compileBatch(
        before.text,
        operations.map((o) => o.operation),
        before.tabId,
      );
      if (compiled.requests.length) {
        for (;;) {
          const delay = Math.max(
            0,
            this.lastWrite +
              (this.options.minWriteIntervalMs ?? 2100) -
              Date.now(),
          );
          if (delay) await abortableDelay(delay, signal);
          signal.throwIfAborted();
          this.lastWrite = Date.now();
          try {
            await this.transport.request(
              "batch",
              {
                documentId: this.documentId,
                revision: before.revision,
                requests: compiled.requests,
              },
              signal,
            );
            requests.push({
              initiatedAt: this.lastWrite,
              completedAt: Date.now(),
              outcome: "acknowledged",
            });
            break;
          } catch (error) {
            errorCode =
              error instanceof GoogleApiError ? error.status : undefined;
            requests.push({
              initiatedAt: this.lastWrite,
              completedAt: Date.now(),
              outcome: "failed",
              errorCode,
            });
            // Retry only explicit quota rejection. 5xx/network outcomes must reconcile first.
            if (
              !(error instanceof GoogleApiError) ||
              error.status !== 429 ||
              ++retryCount >= (this.options.maxAttempts ?? 3)
            )
              throw error;
            await abortableDelay(
              Math.max(
                error.retryAfterMs,
                Math.min(10_000, 1000 * 2 ** retryCount) + Math.random() * 500,
              ),
              signal,
            );
          }
        }
      }
      const state = await this.readState();
      if (state.text !== compiled.text)
        throw new Error(
          "Google acknowledgement differs from the approved checkpoint. Recover to inspect the document.",
        );
      this.expected = state;
      this.options.activity?.({
        sessionId: this.options.sessionId ?? "",
        documentId: this.documentId,
        batchId: operations[0]?.id ?? "",
        initiatedAt: requests[0]?.initiatedAt ?? initiatedAt,
        requests,
        completedAt: Date.now(),
        retryCount,
        outcome: "acknowledged",
        confirmedCharacters: state.text.length,
      });
      return operations.map(({ id }) => ({
        operationId: id,
        acknowledgedAt: Date.now(),
        state,
      }));
    } catch (error) {
      this.options.activity?.({
        sessionId: this.options.sessionId ?? "",
        documentId: this.documentId,
        batchId: operations[0]?.id ?? "",
        initiatedAt: requests[0]?.initiatedAt ?? initiatedAt,
        requests,
        completedAt: Date.now(),
        retryCount,
        errorCode,
        outcome: "failed",
      });
      throw error;
    } finally {
      this.busy = false;
    }
  }
}
function abortableDelay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const cancel = () => {
      clearTimeout(timer);
      reject(
        new Error(
          "Synchronization cancelled; an in-flight write may still complete.",
        ),
      );
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, ms);
    signal.addEventListener("abort", cancel, { once: true });
  });
}
