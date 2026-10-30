import type { SessionLog, Snapshot } from "./engine";
import type { SimulationPlan } from "./plan";
import { applyOperation, eventOperation } from "./operations";
import { validateSettings } from "./settings";

export type SessionCheckpoint = {
  schemaVersion: 1;
  id: string;
  documentId?: string;
  mode: "single" | "two";
  stage: Snapshot["stage"];
  /** Plan stores pending operations once; IDs are `${id}:${index}`. */
  plan: SimulationPlan;
  operationIndex: number;
  lastCompletedOperation: string | null;
  snapshot: Snapshot;
  log: Omit<SessionLog, "events">;
  /** Compact audit timings; operations themselves live only in the plan. */
  audit: {
    planIndex?: number;
    type?: "start" | "pause" | "resume" | "stop" | "complete";
    atMs: number;
    activeMs: number;
    timestamp: string;
  }[];
  checkpointAt: number;
  simulationStartedAt: number;
  lastActivityAt: number;
  nextScheduledAt: number | null;
  accumulatedMs: number;
  sync: "confirmed" | "requires-reconciliation";
  recovery: "interrupted" | "paused" | "complete" | "stopped";
};
export interface SessionStorage {
  save(session: SessionCheckpoint): void | Promise<void>;
  load(
    id: string,
  ): SessionCheckpoint | null | Promise<SessionCheckpoint | null>;
  list(): SessionCheckpoint[] | Promise<SessionCheckpoint[]>;
  delete(id: string): void | Promise<void>;
}
const prefix = "typeflow-checkpoint-v1:";
const MAX_BYTES = 3_000_000;
/** Validation is also the migration gate. Never execute unvalidated stored JSON. */
export function decodeCheckpoint(raw: string): SessionCheckpoint {
  if (raw.length * 2 > MAX_BYTES)
    throw new Error("Saved session exceeds the recovery size limit.");
  const s = JSON.parse(raw) as SessionCheckpoint;
  if (!s || s.schemaVersion !== 1)
    throw new Error("Incompatible session checkpoint version.");
  if (
    typeof s.id !== "string" ||
    !s.id ||
    s.id.length > 200 ||
    !s.plan ||
    !s.snapshot ||
    !s.log ||
    !Array.isArray(s.plan.events) ||
    s.plan.events.length > 500_000 ||
    !Array.isArray(s.audit) ||
    !Number.isInteger(s.operationIndex) ||
    s.operationIndex < 0 ||
    s.operationIndex > s.plan.events.length ||
    !Number.isFinite(s.accumulatedMs) ||
    s.accumulatedMs < 0 ||
    !Number.isFinite(s.checkpointAt) ||
    !Number.isFinite(s.simulationStartedAt) ||
    typeof s.snapshot.text !== "string" ||
    typeof s.plan.source !== "string" ||
    typeof s.plan.initialSource !== "string" ||
    s.log.id !== s.id ||
    s.sync !== "confirmed" ||
    !["running", "paused", "stopped", "completed", "error"].includes(
      s.snapshot.status,
    )
  )
    throw new Error(
      "Corrupted session checkpoint. Discard it or restore your draft.",
    );
  validateSettings(s.log.settings);
  if (s.log.options?.finalSettings)
    validateSettings(s.log.options.finalSettings);
  let text = "",
    last = 0;
  for (let i = 0; i < s.plan.events.length; i++) {
    const event = s.plan.events[i];
    if (
      !Number.isFinite(event.scheduledMs) ||
      event.scheduledMs < last ||
      !["insert", "delete", "replace", "thinking", "stage", "verify"].includes(
        event.type,
      )
    )
      throw new Error("Corrupted operation schedule.");
    if (
      event.typingUnit &&
      (typeof event.typingUnit.text !== "string" ||
        event.typingUnit.text.length > 256 ||
        !Number.isInteger(event.typingUnit.index) ||
        event.typingUnit.index < 0 ||
        !Number.isInteger(event.typingUnit.count) ||
        event.typingUnit.count < 1 ||
        i + event.typingUnit.count > s.plan.events.length ||
        !Number.isInteger(event.typingUnit.sourceIndex) ||
        !["off", "low", "medium", "high"].includes(event.typingUnit.typos))
    )
      throw new Error("Corrupted live typing boundary.");
    last = event.scheduledMs;
    text = applyOperation(text, eventOperation(event));
    if (i + 1 === s.operationIndex && text !== s.snapshot.text)
      throw new Error("Saved document does not match confirmed operations.");
  }
  if (
    (s.operationIndex === 0 && s.snapshot.text !== "") ||
    text !== s.plan.source
  )
    throw new Error("Saved plan does not preserve the approved target.");
  for (const event of s.audit)
    if (
      !event ||
      !Number.isFinite(event.atMs) ||
      !Number.isFinite(event.activeMs) ||
      typeof event.timestamp !== "string" ||
      !Number.isFinite(Date.parse(event.timestamp)) ||
      (event.planIndex !== undefined &&
        (!Number.isInteger(event.planIndex) ||
          event.planIndex < 0 ||
          event.planIndex >= s.operationIndex)) ||
      (event.planIndex === undefined &&
        !["start", "pause", "resume", "stop", "complete"].includes(
          event.type ?? "",
        ))
    )
      throw new Error("Corrupted session audit.");
  return s;
}
export class BrowserSessionStorage implements SessionStorage {
  readonly issues: { id: string; error: string }[] = [];
  constructor(private storage: Storage) {}
  save(session: SessionCheckpoint) {
    const raw = JSON.stringify(session);
    if (raw.length * 2 > MAX_BYTES)
      throw new Error(
        "Session is too large for safe browser recovery. Pause and export your work.",
      );
    try {
      this.storage.setItem(prefix + session.id, raw);
    } catch {
      throw new Error(
        "Checkpoint storage failed. This session is not safely recoverable; export your work.",
      );
    }
  }
  load(id: string) {
    const raw = this.storage.getItem(prefix + id);
    return raw === null ? null : decodeCheckpoint(raw);
  }
  list() {
    const sessions: SessionCheckpoint[] = [];
    this.issues.length = 0;
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key?.startsWith(prefix)) {
        const id = key.slice(prefix.length);
        try {
          const session = this.load(id);
          if (session) sessions.push(session);
        } catch (error) {
          this.issues.push({ id, error: (error as Error).message });
        }
      }
    }
    return sessions.sort((a, b) => b.checkpointAt - a.checkpointAt);
  }
  delete(id: string) {
    this.storage.removeItem(prefix + id);
  }
  /** Also permits explicitly discarding incompatible/corrupted checkpoints. */
  clear() {
    const keys: string[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key?.startsWith(prefix)) keys.push(key);
    }
    for (const key of keys) this.storage.removeItem(key);
  }
}
/** Future chrome.storage.local port: no extension package or Chrome globals. */
export interface ChromeStoragePort {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}
