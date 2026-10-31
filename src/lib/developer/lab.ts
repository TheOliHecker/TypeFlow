import {
  GoogleApiError,
  GoogleDocsOutputAdapter,
  type GoogleTransport,
} from "../google/adapter";
import { AdapterExecutor, type WriteAhead } from "../simulation/adapters";
import { createPlan, type SimulationPlan } from "../simulation/plan";
import { applyOperation, eventOperation } from "../simulation/operations";
import { wordCount } from "../types";
export const INTERVALS = [5, 10, 15, 30, 45, 60, 90, 120];
export type LabConfig = {
  intervals: number[];
  minutes: number;
  wpm: number;
  separate: boolean;
  maxMinutes: number;
  maxDocuments: number;
  retention: number;
  logging: boolean;
};
export const DEFAULT_LAB: LabConfig = {
  intervals: [30],
  minutes: 5,
  wpm: 60,
  separate: false,
  maxMinutes: 20,
  maxDocuments: 8,
  retention: 7,
  logging: true,
};
export function validateConfig(c: LabConfig) {
  if (
    !c.intervals.length ||
    new Set(c.intervals).size !== c.intervals.length ||
    c.intervals.some((i) => !INTERVALS.includes(i)) ||
    ![2, 5, 10].includes(c.minutes) ||
    !Number.isFinite(c.wpm) ||
    c.wpm < 20 ||
    c.wpm > 300 ||
    !Number.isFinite(c.maxMinutes) ||
    c.maxMinutes < 2 ||
    c.maxMinutes > 20 ||
    c.intervals.length * c.minutes > c.maxMinutes ||
    !Number.isInteger(c.maxDocuments) ||
    c.maxDocuments < 1 ||
    c.maxDocuments > 8 ||
    (c.separate ? c.intervals.length : 1) > c.maxDocuments ||
    !Number.isInteger(c.retention) ||
    c.retention < 1 ||
    c.retention > 30
  )
    throw new Error(
      "Choose supported intervals, 2/5/10 minutes, 20–300 WPM, at most 20 total minutes and eight documents.",
    );
}
export const due = (elapsed: number, next: number, duration: number) =>
  elapsed >= Math.min(next, duration);
export type RequestEntry = {
  id: string;
  sessionId: string;
  phase: number;
  documentId?: string;
  kind: string;
  action: string;
  started: number;
  completed?: number;
  status?: number;
  retry: number;
  outcome: "pending" | "acknowledged" | "failed";
  revision?: string;
};
export type Observation = {
  visible: number;
  expanded: number;
  grouped: boolean;
  timestamps: string;
  notes: string;
};
export type Phase = {
  interval: number;
  documentId?: string;
  started?: number;
  ended?: number;
  activeMs: number;
  observation?: Observation;
  verification?: ReturnType<typeof integrity>;
};
export type LabReport = {
  id: string;
  automated: true;
  config: LabConfig;
  started: number;
  ended?: number;
  status: string;
  phase: number;
  phases: Phase[];
  requests: RequestEntry[];
  counts: {
    attempted: number;
    confirmed: number;
    failed: number;
    retries: number;
    latencyTotal: number;
    maxLatency: number;
    lastSync?: number;
  };
  events: { at: number; message: string }[];
};
type Checkpoint = {
  version: 1;
  report: LabReport;
  source: string;
  generated: string;
  confirmed: string;
  index: number;
  prefix: number;
  boundary: boolean;
  next: number;
  journal?: WriteAhead;
  creationUncertain?: boolean;
};
export function syntheticText(length: number, phase: number) {
  const topics = [
    "cedar",
    "harbor",
    "meadow",
    "granite",
    "orchard",
    "willow",
    "observatory",
    "river",
  ];
  const actions = [
    "measures",
    "compares",
    "records",
    "maps",
    "checks",
    "describes",
    "reviews",
    "tracks",
  ];
  let text = "";
  for (let i = 0; text.length < length; i++)
    text += `Sample ${phase + 1}.${i + 1} ${actions[i % actions.length]} the ${topics[Math.floor(i / actions.length) % topics.length]} and its ${i % 2 ? "seasonal patterns" : "changing contours"} under observation ${i + 1}.\n`;
  return text.slice(0, length);
}
export function integrity(actual: string, expected: string) {
  let first = 0;
  while (
    first < actual.length &&
    first < expected.length &&
    actual[first] === expected[first]
  )
    first++;
  let tail = 0;
  while (
    tail < actual.length - first &&
    tail < expected.length - first &&
    actual[actual.length - tail - 1] === expected[expected.length - tail - 1]
  )
    tail++;
  return {
    match: actual === expected,
    intendedCharacters: expected.length,
    actualCharacters: actual.length,
    intendedWords: wordCount(expected),
    actualWords: wordCount(actual),
    intendedParagraphs: expected.split("\n").length,
    actualParagraphs: actual.split("\n").length,
    firstDifference: first,
    missingCharacters: expected.length - first - tail,
    extraCharacters: actual.length - first - tail,
    whitespaceDifference:
      actual !== expected &&
      actual.replace(/\s/gu, "") === expected.replace(/\s/gu, ""),
    punctuationDifference:
      actual !== expected &&
      actual.replace(/[\s\p{P}]/gu, "") === expected.replace(/[\s\p{P}]/gu, ""),
    unicodeDifference:
      actual !== expected &&
      actual.normalize("NFC") === expected.normalize("NFC"),
    possibleDuplication:
      actual.length > expected.length && actual.includes(expected),
  };
}
/** Explicit projection: no sample text, operation payloads, notes, or credentials. */
export function publicReport(r: LabReport) {
  return {
    id: r.id,
    automated: true,
    config: {
      intervals: [...r.config.intervals],
      minutes: r.config.minutes,
      wpm: r.config.wpm,
      separate: r.config.separate,
      maxMinutes: r.config.maxMinutes,
      maxDocuments: r.config.maxDocuments,
      retention: r.config.retention,
      logging: r.config.logging,
    },
    started: r.started,
    ended: r.ended,
    status: r.status,
    counts: {
      attempted: r.counts.attempted,
      confirmed: r.counts.confirmed,
      failed: r.counts.failed,
      retries: r.counts.retries,
      latencyTotal: r.counts.latencyTotal,
      maxLatency: r.counts.maxLatency,
      lastSync: r.counts.lastSync,
    },
    phases: r.phases.map((p) => ({
      interval: p.interval,
      documentId: p.documentId,
      link: p.documentId
        ? `https://docs.google.com/document/d/${p.documentId}/edit`
        : undefined,
      started: p.started,
      ended: p.ended,
      activeMs: p.activeMs,
      verification: p.verification,
      observation: p.observation
        ? {
            visible: p.observation.visible,
            expanded: p.observation.expanded,
            grouped: p.observation.grouped,
            timestamps: p.observation.timestamps
              .split(",")
              .map((t) => t.trim())
              .filter((t) =>
                /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(
                  t,
                ),
              )
              .slice(0, 20),
          }
        : undefined,
    })),
    requests: r.requests.map((e) => ({
      id: e.id,
      sessionId: e.sessionId,
      phase: e.phase,
      documentId: e.documentId,
      kind: e.kind,
      action: e.action,
      started: e.started,
      completed: e.completed,
      status: e.status,
      retry: e.retry,
      outcome: e.outcome,
      revision: e.revision,
    })),
    events: r.events,
  };
}
export function csvReport(r: LabReport) {
  const rows: unknown[][] = [
    [
      "test_id",
      "automated",
      "started",
      "ended",
      "interval_seconds",
      "scheduled_minutes",
      "active_ms",
      "document_id",
      "writes_attempted",
      "writes_confirmed",
      "failed",
      "retries",
      "average_latency_ms",
      "error_rate",
      "visible_versions",
      "expanded_versions",
      "requests_per_observed_version",
      "exact_match",
      "configuration",
      "synchronization_errors",
      "verification",
      "manual_observation",
    ],
  ];
  r.phases.forEach((p, i) => {
    const writes = r.requests.filter(
      (e) => e.phase === i && e.action === "batch" && e.kind === "sync",
    );
    const confirmed = writes.filter((e) => e.outcome === "acknowledged").length;
    rows.push([
      r.id,
      true,
      p.started ? new Date(p.started).toISOString() : "",
      p.ended ? new Date(p.ended).toISOString() : "",
      p.interval,
      r.config.minutes,
      p.activeMs,
      p.documentId,
      writes.length,
      confirmed,
      writes.filter((e) => e.outcome === "failed").length,
      writes.filter((e) => e.retry).length,
      writes.length
        ? writes.reduce(
            (n, e) => n + ((e.completed ?? e.started) - e.started),
            0,
          ) / writes.length
        : "",
      writes.length ? (writes.length - confirmed) / writes.length : "",
      p.observation?.visible,
      p.observation?.expanded,
      p.observation?.visible ? writes.length / p.observation.visible : "",
      p.verification?.match,
      JSON.stringify(publicReport(r).config),
      JSON.stringify(
        writes
          .filter((e) => e.outcome === "failed")
          .map((e) => ({ requestId: e.id, status: e.status, at: e.started })),
      ),
      JSON.stringify(p.verification),
      JSON.stringify(publicReport(r).phases[i].observation),
    ]);
  });
  return rows
    .map((row) =>
      row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","),
    )
    .join("\r\n");
}
export async function developerCall(action: string, body: unknown) {
  const response = await fetch(`/api/developer/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-TypeFlow-Request": "1" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new GoogleApiError(
      data.error ?? "Developer request failed.",
      response.status,
      data.retryAfterMs,
    );
  return data;
}
const KEY = "typeflow-developer-active-v1";
export class SyncLab {
  report: LabReport;
  private source = "";
  private generated = "";
  private confirmed = "";
  private index = 0;
  private prefix = 0;
  private boundary = false;
  private next = 0;
  private plan?: SimulationPlan;
  private journal?: WriteAhead;
  private creationUncertain = false;
  private adapter: GoogleDocsOutputAdapter;
  private executor: AdapterExecutor;
  private busy = false;
  private lastTick = performance.now();
  private kind = "setup";
  private retries = 0;
  constructor(
    config: LabConfig,
    private storage: Storage,
    private update: () => void,
    private supplied = "",
    restored?: Checkpoint,
  ) {
    validateConfig(config);
    this.report = restored?.report ?? {
      id: crypto.randomUUID(),
      automated: true,
      config: structuredClone(config),
      started: Date.now(),
      status: "ready",
      phase: 0,
      phases: config.intervals.map((interval) => ({ interval, activeMs: 0 })),
      requests: [],
      counts: {
        attempted: 0,
        confirmed: 0,
        failed: 0,
        retries: 0,
        latencyTotal: 0,
        maxLatency: 0,
      },
      events: [],
    };
    if (restored) {
      this.source = restored.source;
      this.generated = restored.generated;
      this.confirmed = restored.confirmed;
      this.index = restored.index;
      this.prefix = restored.prefix;
      this.boundary = restored.boundary;
      this.next = restored.next;
      this.journal = restored.journal;
      this.creationUncertain = restored.creationUncertain ?? false;
      if (!["stopped", "completed"].includes(this.report.status))
        this.report.status = "interrupted";
    }
    const transport: GoogleTransport = {
      request: async (action, body) => {
        if (action !== "read" && this.report.status !== "running")
          throw new Error("Stopped before dispatch; no new write sent.");
        const entry: RequestEntry = {
          id: crypto.randomUUID(),
          sessionId: this.report.id,
          phase: this.report.phase,
          documentId: body.documentId as string | undefined,
          kind: this.kind,
          action,
          started: Date.now(),
          retry: action === "batch" ? this.retries++ : 0,
          outcome: "pending",
        };
        if (action === "batch") {
          this.report.counts.attempted++;
          if (entry.retry) this.report.counts.retries++;
        }
        if (this.report.config.logging) this.report.requests.push(entry);
        this.report.requests = this.report.requests.slice(-2000);
        try {
          const data = await developerCall(action, {
            ...body,
            run: this.report.id,
          });
          if (action === "create") {
            this.report.phases[this.report.phase].documentId = (
              data as { documentId?: string }
            ).documentId;
            this.save();
          }
          entry.status = 200;
          entry.outcome = "acknowledged";
          if (action === "batch") {
            this.report.counts.confirmed++;
            this.report.counts.lastSync = Date.now();
          }
          const doc = data as {
            revisionId?: string;
            writeControl?: { requiredRevisionId?: string };
          };
          entry.revision =
            doc.revisionId ?? doc.writeControl?.requiredRevisionId;
          return data;
        } catch (error) {
          if (
            action === "create" &&
            !this.report.phases[this.report.phase].documentId
          )
            this.creationUncertain = true;
          entry.status =
            error instanceof GoogleApiError ? error.status : undefined;
          entry.outcome = "failed";
          if (action === "batch") this.report.counts.failed++;
          throw error;
        } finally {
          entry.completed = Date.now();
          if (action === "batch") {
            const latency = entry.completed - entry.started;
            this.report.counts.latencyTotal += latency;
            this.report.counts.maxLatency = Math.max(
              this.report.counts.maxLatency,
              latency,
            );
          }
          this.update();
        }
      },
    };
    this.adapter = new GoogleDocsOutputAdapter(transport, {
      maxAttempts: 2,
      minWriteIntervalMs: 2100,
      sessionId: this.report.id,
    });
    this.executor = new AdapterExecutor(
      this.adapter,
      {
        load: async (id) => (this.journal?.id === id ? this.journal : null),
        save: async (record) => {
          this.journal = record;
          this.save();
        },
      },
      150_000,
    );
  }
  static restore(storage: Storage, update: () => void) {
    const raw = storage.getItem(KEY);
    if (!raw) return null;
    if (raw.length > 2_000_000)
      throw new Error("Checkpoint too large. Clear diagnostic history.");
    const c = JSON.parse(raw) as Checkpoint;
    if (
      c.version !== 1 ||
      !c.report ||
      !c.report.phases[c.report.phase] ||
      typeof c.source !== "string" ||
      typeof c.confirmed !== "string" ||
      typeof c.generated !== "string"
    )
      throw new Error("Invalid laboratory checkpoint.");
    return new SyncLab(c.report.config, storage, update, "", c);
  }
  private save() {
    const c: Checkpoint = {
      version: 1,
      report: this.report,
      source: this.source,
      generated: this.generated,
      confirmed: this.confirmed,
      index: this.index,
      prefix: this.prefix,
      boundary: this.boundary,
      next: this.next,
      journal: this.journal,
      creationUncertain: this.creationUncertain,
    };
    const raw = JSON.stringify(c);
    if (raw.length > 2_000_000)
      throw new Error(
        "Diagnostic checkpoint capacity exceeded. Export results before clearing.",
      );
    this.storage.setItem(KEY, raw);
  }
  private event(message: string) {
    if (!this.report.config.logging) return;
    this.report.events = [
      ...this.report.events.slice(-199),
      { at: Date.now(), message },
    ];
  }
  private buildPlan() {
    this.plan = createPlan(this.source, {
      wpm: this.report.config.wpm,
      variation: false,
      pauses: "off",
      typos: "off",
      durationSeconds: null,
    });
  }
  get progress() {
    return {
      generatedWords: wordCount(this.generated.slice(this.prefix)),
      pendingCharacters: Math.max(
        0,
        this.generated.length - this.confirmed.length,
      ),
      operationsQueued: Math.max(
        0,
        this.generated.length - this.confirmed.length,
      ),
      busy: this.busy,
    };
  }
  async start() {
    if (this.report.status !== "ready" || this.busy)
      throw new Error("Experiment already started.");
    this.busy = true;
    try {
      await developerCall("control", { command: "start", run: this.report.id });
      this.report.status = "running";
      this.report.started = Date.now();
      this.lastTick = performance.now();
      this.save();
    } catch (error) {
      this.report.status = "stopped";
      await developerCall("control", {
        command: "stop",
        run: this.report.id,
      }).catch(() => {});
      throw error;
    } finally {
      this.busy = false;
      this.update();
    }
  }
  async control(command: "pause" | "resume" | "stop" | "emergency") {
    if (command === "resume") {
      if (this.creationUncertain)
        throw new Error(
          "Document creation outcome is uncertain. Inspect Drive manually, then stop this experiment and explicitly start a new one.",
        );
      if (
        this.busy ||
        !["paused", "interrupted", "attention"].includes(this.report.status)
      )
        throw new Error(
          "Wait for the in-flight request before reconciliation.",
        );
      this.busy = true;
      try {
        await developerCall("control", {
          command: "pause",
          run: this.report.id,
        });
        const p = this.report.phases[this.report.phase];
        if (p.documentId) {
          await this.adapter.initialize({ documentId: p.documentId });
          if (this.journal) {
            const r = await this.executor.reconcile(this.journal);
            if (r.state === "confirmed") this.acceptRecovery(r);
          }
          const remote = await this.adapter.readState();
          if (remote.text !== this.confirmed)
            throw new Error(
              "Concurrent document changes detected. No writes sent.",
            );
        }
        this.executor.resume();
        this.buildPlanIfNeeded();
        await developerCall("control", { command, run: this.report.id });
        this.report.status = "running";
        if (this.journal?.state === "ready") {
          const record = this.journal;
          const result = await this.executor.execute(
            record.id,
            record.operation,
            record.plannedAt,
          );
          if (result.state === "confirmed") this.acceptRecovery(result);
        }
        this.lastTick = performance.now();
        this.event(
          "Resumed after reconciliation; missed writes were not synthesized.",
        );
        this.save();
      } catch (error) {
        if (this.report.status === "running") this.report.status = "attention";
        throw error;
      } finally {
        this.busy = false;
        this.update();
      }
      return;
    }
    this.report.status = command === "pause" ? "paused" : "stopped";
    if (command !== "pause") this.report.ended = Date.now();
    this.event(
      `${command}: new writes blocked; an in-flight request may still complete.`,
    );
    let storageError: unknown;
    try {
      this.save();
    } catch (error) {
      storageError = error;
    }
    this.update();
    await developerCall("control", { command, run: this.report.id });
    if (storageError) throw storageError;
  }
  private acceptRecovery(record: WriteAhead) {
    this.confirmed = record.afterText;
    this.journal = undefined;
    if (!this.boundary && this.generated === this.confirmed) {
      const p = this.report.phases[this.report.phase];
      this.prefix = this.generated.length;
      this.boundary = true;
      p.started ??= Date.now();
      this.next = p.interval * 1000;
      const length = Math.ceil(
        this.report.config.wpm * 5 * this.report.config.minutes,
      );
      this.source ||=
        this.supplied || syntheticText(length + 20, this.report.phase);
      this.buildPlanIfNeeded();
    }
  }
  private buildPlanIfNeeded() {
    if (this.source && !this.plan) this.buildPlan();
  }
  private async write(text: string, kind: string) {
    if (this.report.status !== "running" || text === this.confirmed) return;
    if (!text.startsWith(this.confirmed))
      throw new Error("Append-only checkpoint differs from confirmed content.");
    this.kind = kind;
    this.retries = 0;
    const op = {
      type: "insert" as const,
      index: this.confirmed.length,
      text: text.slice(this.confirmed.length),
    };
    const r = await this.executor.execute(
      `${this.report.id}:${this.report.phase}:${kind}:${this.confirmed.length}`,
      op,
      Date.now(),
    );
    if (r.state === "confirmed") {
      this.confirmed = r.afterText;
      this.journal = undefined;
      this.save();
    }
  }
  async tick() {
    if (this.report.status !== "running") return;
    const now = performance.now(),
      delta = now - this.lastTick;
    this.lastTick = now;
    if (delta > 5000) {
      this.event(
        "Foreground execution interrupted; intended schedule differs from actual execution.",
      );
      await this.control("pause");
      return;
    }
    const p = this.report.phases[this.report.phase];
    if (p.started)
      p.activeMs = Math.min(
        this.report.config.minutes * 60_000,
        p.activeMs + delta,
      );
    if (this.busy) {
      this.update();
      return;
    }
    this.busy = true;
    try {
      if (!p.documentId) {
        const previous = this.report.phases[this.report.phase - 1];
        if (!this.report.config.separate && previous?.documentId)
          p.documentId = previous.documentId;
        else {
          this.kind = "create";
          const state = await this.adapter.create("TypeFlow Automated Test");
          p.documentId = state.documentId;
        }
        this.save();
      }
      if (this.report.status !== "running") return;
      if (!this.boundary) {
        const remote = await this.adapter.initialize({
          documentId: p.documentId,
          text: this.confirmed,
        });
        this.confirmed = remote.text;
        const marker = `\n[TypeFlow Automated Test ${this.report.phase + 1} — ${p.interval}-second interval]\n`;
        this.generated = this.confirmed + marker;
        await this.write(this.generated, "boundary");
        if (this.confirmed !== this.generated) return;
        this.prefix = this.generated.length;
        this.boundary = true;
        p.started = Date.now();
        p.activeMs = 0;
        this.lastTick = performance.now();
        this.next = p.interval * 1000;
        const length = Math.ceil(
          this.report.config.wpm * 5 * this.report.config.minutes,
        );
        if (this.supplied && this.supplied.length < length)
          throw new Error(
            "Supply enough test text for the selected speed and duration.",
          );
        this.source =
          this.supplied || syntheticText(length + 20, this.report.phase);
        this.buildPlan();
        this.save();
      }
      if (this.report.status !== "running") return;
      this.buildPlanIfNeeded();
      while (
        this.index < this.plan!.events.length &&
        this.plan!.events[this.index].scheduledMs <= p.activeMs
      )
        this.generated = applyOperation(
          this.generated,
          this.offsetEvent(this.plan!.events[this.index++]),
        );
      const duration = this.report.config.minutes * 60_000;
      if (due(p.activeMs, this.next, duration)) {
        await this.write(this.generated, "sync");
        this.next = p.activeMs + p.interval * 1000;
        this.save();
      }
      if (
        p.activeMs >= duration &&
        this.confirmed === this.generated &&
        this.report.status === "running"
      ) {
        this.kind = "verification";
        const remote = await this.adapter.readState();
        p.verification = integrity(remote.text, this.generated);
        if (this.report.status !== "running") return;
        if (!p.verification.match)
          throw new Error(
            "Final document mismatch; review integrity diagnostics.",
          );
        p.ended = Date.now();
        if (this.report.phase + 1 === this.report.phases.length) {
          await developerCall("control", {
            command: "stop",
            run: this.report.id,
          });
          this.report.status = "completed";
          this.report.ended = Date.now();
        } else {
          this.report.phase++;
          this.boundary = false;
          this.index = 0;
          this.plan = undefined;
          this.source = "";
          if (this.report.config.separate) {
            this.generated = "";
            this.confirmed = "";
          }
        }
        this.save();
      }
    } catch {
      if (this.report.status === "running") this.report.status = "attention";
      this.event(
        "Synchronization blocked. Check authorization/connection; reconcile before resuming. A write may have completed.",
      );
      try {
        this.save();
      } catch {
        this.event(
          "Storage full: checkpoint could not be saved. Export metadata now.",
        );
      }
    } finally {
      this.busy = false;
      this.update();
    }
  }
  private offsetEvent(event: SimulationPlan["events"][number]) {
    const operation = eventOperation(event);
    if (operation.type === "verify")
      return {
        ...operation,
        expected: this.generated.slice(0, this.prefix) + operation.expected,
      };
    if ("index" in operation)
      return { ...operation, index: operation.index + this.prefix };
    return operation;
  }
  async validate(expected?: string) {
    this.kind = "validation";
    const p = this.report.phases[this.report.phase];
    if (!p.documentId) throw new Error("Create a test document first.");
    const state = await this.adapter.readState();
    const target = expected ?? this.generated;
    p.verification = integrity(state.text, target);
    this.save();
    this.update();
    return { actual: state.text, expected: target, result: p.verification };
  }
  clearCheckpoint() {
    if (this.busy || this.report.status === "running")
      throw new Error("Stop and wait for the in-flight request first.");
    this.storage.removeItem(KEY);
  }
}
