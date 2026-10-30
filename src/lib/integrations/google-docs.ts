/** Contracts only. No OAuth, tokens, network calls, or fake connected states. */
export type ConnectionState =
  | "disconnected"
  | "authorizing"
  | "connected"
  | "reauthorization-required";
export type AuthorizedDocument = {
  documentId: string;
  title: string;
  url: string;
  revisionId: string;
};
export type AutomatedEdit = {
  operationId: string;
  sessionId: string;
  kind: "automated-writing-simulation";
  documentId: string;
  tabId: string;
  /** Google Docs indices are UTF-16 offsets; do not use code-point counts. */
  index: number;
  insertText?: string;
  deleteUtf16Length?: number;
  expectedRevisionId: string;
};
export type EditReceipt = {
  operationId: string;
  kind: "automated-writing-simulation";
  documentId: string;
  /** Locally observed network timestamps, not invented Google revision dates. */
  sentAt: string;
  acknowledgedAt: string;
  revisionId: string;
  outcome: "acknowledged" | "reconciled";
};
export type RetryPolicy = {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  jitter: boolean;
  respectRetryAfter: true;
};
export interface GoogleDocsAuth {
  state(): ConnectionState;
  /** Future server-backed authorization-code flow with PKCE and OAuth state. */
  authorize(signal: AbortSignal): Promise<void>;
  disconnect(): Promise<void>;
}
export interface GoogleDocsAdapter {
  createDocument(
    title: string,
    automationNotice: string,
    signal: AbortSignal,
  ): Promise<AuthorizedDocument>;
  /** Serialized, quota-aware writes; persist/reconcile IDs before retrying. */
  applyEdits(
    edits: readonly AutomatedEdit[],
    signal: AbortSignal,
  ): Promise<readonly EditReceipt[]>;
  readCheckpoint(
    documentId: string,
    signal: AbortSignal,
  ): Promise<{ revisionId: string; content: string; tabId: string }>;
}
export interface AuthorizedSessionCoordinator {
  /** Real-time only. Simulation replay must never backdate remote edits. */
  connect(
    adapter: GoogleDocsAdapter,
    document: AuthorizedDocument,
  ): Promise<void>;
  enqueue(edit: AutomatedEdit): Promise<EditReceipt>;
  pause(): void;
  resumeAfterReconciliation(signal: AbortSignal): Promise<void>;
  disconnect(): Promise<void>;
}
