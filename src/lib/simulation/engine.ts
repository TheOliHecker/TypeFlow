import { applyOperation } from "./operations";
import type { SessionCheckpoint } from "./session";
import { validateSettings, intensity } from "./settings";
import { ForegroundScheduler } from "./scheduler";
import { type SimulationSettings } from "../types";
import {
  createPlan,
  type PlanEvent,
  type SimulationPlan,
  type SessionOptions,
  type Stage,
} from "./plan";

export type Status =
  | "idle"
  | "running"
  | "paused"
  | "stopped"
  | "completed"
  | "error";
export type SimulationEvent = Omit<PlanEvent, "scheduledMs" | "type"> & {
  type: PlanEvent["type"] | "start" | "pause" | "resume" | "stop" | "complete";
  atMs: number;
  activeMs: number;
  timestamp: string;
  scheduledMs?: number;
};
export type SessionLog = {
  schemaVersion: 1 | 2 | 3;
  metrics?: {
    baseWpm: number;
    revisionBaseWpm: number;
    effectiveWpm: number;
    durationMs: number;
  };
  kind: "automated-writing-simulation";
  authorshipNotice: string;
  id: string;
  title: string;
  source: string;
  initialSource?: string;
  options?: SessionOptions;
  settings: SimulationSettings;
  startedAt: string;
  completedAt?: string;
  events: SimulationEvent[];
};
export type Snapshot = {
  status: Status;
  text: string;
  sourceIndex: number;
  elapsedMs: number;
  remainingMs: number;
  progress: number;
  currentWpm: number;
  activity: "typing" | "thinking" | "correcting";
  eventCount: number;
  stage: Stage;
  editIndex?: number;
  operation?: string;
  error?: string;
  storageError?: string;
  recoveryStatus?:
    | "recovering"
    | "synchronizing"
    | "interrupted"
    | "requires attention";
};
export const IDLE_SNAPSHOT: Snapshot = {
  status: "idle",
  text: "",
  sourceIndex: 0,
  elapsedMs: 0,
  remainingMs: 0,
  progress: 0,
  currentWpm: 0,
  activity: "typing",
  eventCount: 0,
  stage: "draft",
};

/** Clock injection makes timer drift, suspension, and cleanup testable. */
export type Clock = {
  now: () => number;
  date: () => Date;
  set: (fn: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clear: (id: ReturnType<typeof setTimeout>) => void;
};
function browserClock(): Clock {
  const scheduler = new ForegroundScheduler();
  return {
    now: scheduler.now,
    date: () => new Date(scheduler.now()),
    set: (fn, delay) => scheduler.schedule(scheduler.now() + delay, fn),
    clear: () => scheduler.cancel(),
  };
}

export function applyEvent(
  text: string,
  event: Pick<
    SimulationEvent,
    "type" | "text" | "index" | "deleteCount" | "expected"
  >,
): string {
  const index =
    event.index ??
    (event.type === "delete" ? Math.max(0, text.length - 1) : text.length);
  if (event.type === "verify")
    return applyOperation(text, { type: "verify", expected: event.expected! });
  if (event.type === "insert")
    return applyOperation(text, {
      type: "insert",
      index,
      text: event.text ?? "",
    });
  if (event.type === "delete" || event.type === "replace")
    return applyOperation(text, {
      type: event.type,
      index,
      expected:
        event.expected ??
        (event.type === "delete" ? event.text : undefined) ??
        text.slice(index, index + (event.deleteCount ?? 1)),
      text: event.text ?? "",
    });
  return text;
}

/** One owner, one timer. Processes deadlines against absolute deadlines and a pause-adjusted active clock. */
export class SimulationEngine {
  private snapshot: Snapshot = { ...IDLE_SNAPSHOT };
  private plan: SimulationPlan | null = null;
  private log: SessionLog | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private origin = 0;
  private activeOrigin = 0;
  private accumulated = 0;
  private index = 0;
  private listeners = new Set<() => void>();
  private checkpointWriter?: (checkpoint: SessionCheckpoint) => void;
  private checkpointAt = 0;
  private audit: SessionCheckpoint["audit"] = [];
  setCheckpointWriter(writer?: (checkpoint: SessionCheckpoint) => void) {
    this.checkpointWriter = writer;
  }
  checkpoint = () => {
    if (!this.plan || !this.log || !this.checkpointWriter) return;
    const now = this.clock.date().getTime();
    const previousError = this.snapshot.storageError;
    const { events: _events, ...log } = this.log;
    void _events;
    try {
      this.checkpointWriter({
        schemaVersion: 1,
        id: log.id,
        mode: log.options?.finalText !== undefined ? "two" : "single",
        stage: this.snapshot.stage,
        plan: this.plan,
        operationIndex: this.index,
        lastCompletedOperation: this.index
          ? `${log.id}:${this.plan.events[this.index - 1].id ?? this.index - 1}`
          : null,
        snapshot: { ...this.snapshot },
        log,
        audit: this.audit,
        checkpointAt: now,
        simulationStartedAt: Date.parse(log.startedAt),
        lastActivityAt: Date.parse(
          this.log.events.at(-1)?.timestamp ?? log.startedAt,
        ),
        nextScheduledAt:
          this.snapshot.status === "running" && this.plan.events[this.index]
            ? now +
              Math.max(
                0,
                this.plan.events[this.index].scheduledMs - this.activeTime(),
              )
            : null,
        accumulatedMs: this.activeTime(),
        sync: "confirmed",
        recovery:
          this.snapshot.status === "completed"
            ? "complete"
            : this.snapshot.status === "paused"
              ? "paused"
              : this.snapshot.status === "stopped"
                ? "stopped"
                : "interrupted",
      });
      this.checkpointAt = now;
      if (this.snapshot.storageError)
        this.snapshot = { ...this.snapshot, storageError: undefined };
    } catch (error) {
      this.snapshot = {
        ...this.snapshot,
        storageError: (error as Error).message,
      };
    }
    if (previousError !== this.snapshot.storageError) this.notify();
  };
  recover(saved: SessionCheckpoint) {
    if (this.snapshot.status === "running" || this.snapshot.status === "paused")
      throw new Error("Stop the current session before recovering.");
    this.cancel();
    this.plan = structuredClone(saved.plan);
    this.index = saved.operationIndex;
    this.audit = structuredClone(saved.audit);
    this.log = {
      ...structuredClone(saved.log),
      events: this.audit.map((entry) => ({
        ...(entry.planIndex !== undefined
          ? this.plan!.events[entry.planIndex]
          : { type: entry.type!, sourceIndex: 0 }),
        atMs: entry.atMs,
        activeMs: entry.activeMs,
        timestamp: entry.timestamp,
      })),
    };
    this.accumulated = saved.accumulatedMs;
    this.origin =
      this.clock.now() -
      (this.clock.date().getTime() - saved.simulationStartedAt);
    this.activeOrigin = this.clock.now();
    // Reopen the confirmed local document; offline time is not fabricated typing.
    this.snapshot = {
      ...saved.snapshot,
      status: "paused",
      currentWpm: 0,
      recoveryStatus: "interrupted",
      storageError: undefined,
    };
    this.checkpoint();
    this.notify();
  }
  emergencyStop() {
    this.stop();
  }
  cancelSession() {
    this.stop();
    this.reset();
  }
  updateLiveSettings(
    stage: "draft" | "revision",
    settings: SimulationSettings,
  ) {
    validateSettings(settings);
    if (!this.plan || !this.log) return;
    const old =
      stage === "draft"
        ? this.log.settings
        : (this.log.options?.finalSettings ?? this.log.settings);
    let previous = this.plan.events[this.index - 1]?.scheduledMs ?? 0;
    let nextTime = Math.max(previous, this.activeTime());
    for (let i = this.index; i < this.plan.events.length; i++) {
      const event = this.plan.events[i];
      let gap = event.scheduledMs - previous;
      previous = event.scheduledMs;
      const matches = event.stage === stage;
      const ratio =
        event.type === "thinking"
          ? intensity[settings.pauses] / Math.max(1, intensity[old.pauses])
          : old.wpm / settings.wpm;
      if (
        matches &&
        old.pauses === "off" &&
        settings.pauses !== "off" &&
        this.plan.events[i - 1]?.type === "insert" &&
        /[.!?\n]/u.test(this.plan.events[i - 1].text ?? "")
      )
        gap += 300 * intensity[settings.pauses];
      nextTime += gap * (matches ? ratio : 1);
      if (matches && event.typingMs !== undefined)
        event.typingMs *= old.wpm / settings.wpm;
      event.scheduledMs = nextTime;
    }
    this.plan.durationMs = nextTime;
    if (old.typos !== settings.typos) this.refreshTypingUnits(stage, settings);
    if (stage === "draft") this.log.settings = structuredClone(settings);
    else
      this.log.options = {
        ...this.log.options,
        finalSettings: structuredClone(settings),
      };
    this.snapshot = {
      ...this.snapshot,
      remainingMs: Math.max(0, this.plan.durationMs - this.activeTime()),
    };
    if (this.log.metrics) {
      this.log.metrics.durationMs = this.plan.durationMs;
      this.log.metrics.effectiveWpm =
        this.plan.source.length / 5 / (this.plan.durationMs / 60000);
      if (stage === "draft") this.log.metrics.baseWpm = settings.wpm;
      else this.log.metrics.revisionBaseWpm = settings.wpm;
    }
    this.checkpoint();
    this.notify();
  }
  constructor(private clock: Clock = browserClock()) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getLog = (): SessionLog | null =>
    this.log ? structuredClone(this.log) : null;
  getOutputProgress = () => ({ index: this.index, sessionId: this.log?.id });
  /** Host synchronization consumes only operations already executed locally. */
  getOutputCheckpoint = () =>
    this.plan && this.log
      ? {
          sessionId: this.log.id,
          index: this.index,
          events: this.plan.events.slice(0, this.index),
          target: this.plan.source,
          snapshot: this.snapshot,
        }
      : null;
  getMetadata = () =>
    this.log
      ? {
          id: this.log.id,
          title: this.log.title,
          status: this.snapshot.status,
          startedAt: this.log.startedAt,
          updatedAt: this.clock.date().toISOString(),
          characters: this.log.source.length,
        }
      : null;
  private notify() {
    for (const listener of this.listeners) listener();
  }
  private cancel() {
    if (this.timer !== null) this.clock.clear(this.timer);
    this.timer = null;
  }
  private activeTime() {
    return (
      this.accumulated +
      (this.snapshot.status === "running"
        ? this.clock.now() - this.activeOrigin
        : 0)
    );
  }
  private record(
    event: Omit<SimulationEvent, "atMs" | "activeMs" | "timestamp">,
  ) {
    this.audit.push({
      ...(this.plan?.events[this.index - 1] === event
        ? { planIndex: this.index - 1 }
        : {
            type: event.type as
              | "start"
              | "pause"
              | "resume"
              | "stop"
              | "complete",
          }),
      atMs: this.clock.now() - this.origin,
      activeMs: this.activeTime(),
      timestamp: this.clock.date().toISOString(),
    });
    this.log?.events.push({
      ...event,
      atMs: this.clock.now() - this.origin,
      activeMs: this.activeTime(),
      timestamp: this.clock.date().toISOString(),
    });
  }
  start(
    text: string,
    settings: SimulationSettings,
    title = "Untitled document",
    options: SessionOptions = {},
  ) {
    if (this.snapshot.status === "running" || this.snapshot.status === "paused")
      return false;
    const plan = createPlan(text, settings, undefined, options);
    this.cancel();
    this.plan = plan;
    plan.events.forEach((event, index) => {
      event.id = index;
    });
    this.index = 0;
    this.audit = [];
    this.accumulated = 0;
    this.origin = this.activeOrigin = this.clock.now();
    const startedAt = this.clock.date().toISOString();
    this.log = {
      schemaVersion: 3,
      metrics: {
        baseWpm: plan.baseWpm,
        revisionBaseWpm: options.finalSettings?.wpm ?? settings.wpm,
        effectiveWpm: plan.effectiveWpm,
        durationMs: plan.durationMs,
      },
      kind: "automated-writing-simulation",
      authorshipNotice:
        "Automated simulation of supplied text. Event timestamps record actual browser activity; they do not prove original human authorship.",
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `session-${this.clock.date().getTime()}`,
      title,
      source: plan.source,
      initialSource: plan.initialSource,
      options: structuredClone(options),
      settings: structuredClone(settings),
      startedAt,
      events: [],
    };
    this.snapshot = {
      ...IDLE_SNAPSHOT,
      status: "running",
      remainingMs: plan.durationMs,
      currentWpm: plan.baseWpm,
    };
    this.record({ type: "start", sourceIndex: 0 });
    this.checkpoint();
    this.notify();
    this.schedule();
    return true;
  }
  private schedule() {
    this.cancel();
    if (this.snapshot.status === "running")
      this.timer = this.clock.set(
        this.tick,
        Math.max(
          1,
          Math.min(
            250,
            (this.plan?.events[this.index]?.scheduledMs ??
              this.activeTime() + 250) - this.activeTime(),
          ),
        ),
      );
  }
  private refreshTypingUnits(
    stage: "draft" | "revision",
    settings: SimulationSettings,
  ) {
    if (!this.plan) return;
    const result = this.plan.events.slice(0, this.index);
    let shift = 0;
    for (let i = this.index; i < this.plan.events.length; ) {
      const event = this.plan.events[i],
        unit = event.typingUnit;
      if (!unit || event.stage !== stage || unit.typos === settings.typos) {
        event.scheduledMs += shift;
        result.push(event);
        i++;
        continue;
      }
      // Only untouched, self-contained words are regenerated; active correction
      // groups and sentence/proofreading deferred slips retain their original plan.
      const replacement = createPlan(unit.text, {
        ...settings,
        durationSeconds: null,
      });
      const from = result.at(-1)?.scheduledMs ?? 0;
      const oldEnd = this.plan.events[i + unit.count - 1].scheduledMs;
      const replacementEvents = replacement.events.filter(
        (e) => e.type !== "verify" && e.type !== "stage",
      );
      const groupId = crypto.randomUUID();
      replacementEvents.forEach((e, n) =>
        result.push({
          ...e,
          id: `${groupId}:${n}`,
          scheduledMs: from + e.scheduledMs,
          stage: event.stage,
          sourceIndex:
            stage === "revision"
              ? event.sourceIndex
              : unit.sourceIndex + e.sourceIndex,
          index: e.index === undefined ? undefined : unit.index + e.index,
          operation: event.operation,
          typingUnit:
            n === 0
              ? {
                  ...unit,
                  count: replacementEvents.length,
                  typos: settings.typos,
                }
              : undefined,
        }),
      );
      shift = (result.at(-1)?.scheduledMs ?? from) - oldEnd;
      i += unit.count;
    }
    this.plan.events = result;
    this.plan.durationMs += shift;
  }
  private tick = () => {
    if (this.snapshot.status !== "running" || !this.plan) return;
    const elapsedMs = this.activeTime();
    let text = this.snapshot.text;
    let sourceIndex = this.snapshot.sourceIndex;
    let activity = this.snapshot.activity;
    let stage = this.snapshot.stage;
    let editIndex = this.snapshot.editIndex;
    let operation = this.snapshot.operation;
    let processed = 0;
    // Bound work after background-tab throttling. All overdue events still retain
    // their actual processing timestamps instead of invented historical times.
    while (
      this.index < this.plan.events.length &&
      this.plan.events[this.index].scheduledMs <= elapsedMs &&
      processed < 1000
    ) {
      const event = this.plan.events[this.index];
      try {
        text = applyEvent(text, event);
      } catch (error) {
        this.cancel();
        this.snapshot = {
          ...this.snapshot,
          text,
          status: "error",
          error: (error as Error).message,
        };
        this.checkpoint();
        this.notify();
        return;
      }
      this.index++;
      operation = event.operation ?? operation;
      sourceIndex = event.sourceIndex;
      stage = event.stage ?? stage;
      if (event.index !== undefined)
        editIndex =
          event.index +
          (event.type === "insert" ? (event.text?.length ?? 0) : 0);
      activity =
        event.type === "thinking"
          ? "thinking"
          : event.correction
            ? "correcting"
            : "typing";
      this.record(event);
      processed++;
    }
    const next = this.plan.events[this.index];
    const currentWpm =
      activity === "thinking"
        ? 0
        : next && next.scheduledMs > elapsedMs
          ? Math.min(
              999,
              Math.round(
                12000 /
                  Math.max(
                    20,
                    next.scheduledMs -
                      (this.plan.events[this.index - 1]?.scheduledMs ?? 0),
                  ),
              ),
            )
          : Math.round(this.plan.effectiveWpm);
    this.snapshot = {
      ...this.snapshot,
      text,
      sourceIndex,
      elapsedMs,
      remainingMs: Math.max(0, this.plan.durationMs - elapsedMs),
      progress: Math.min(99, (this.index / this.plan.events.length) * 100),
      stage,
      editIndex,
      operation,
      currentWpm,
      activity,
      eventCount: this.log!.events.length,
    };
    if (this.index === this.plan.events.length) {
      this.accumulated = elapsedMs;
      this.snapshot = {
        ...this.snapshot,
        status: "completed",
        progress: 100,
        currentWpm: 0,
        remainingMs: 0,
      };
      this.record({ type: "complete", sourceIndex });
      this.snapshot = { ...this.snapshot, eventCount: this.log!.events.length };
      this.log!.completedAt = this.clock.date().toISOString();
      this.cancel();
    } else this.schedule();
    if (
      this.snapshot.status === "completed" ||
      this.clock.date().getTime() - this.checkpointAt >= 5000
    )
      this.checkpoint();
    this.notify();
  };
  pause() {
    if (this.snapshot.status !== "running") return;
    this.accumulated = this.activeTime();
    this.snapshot = {
      ...this.snapshot,
      status: "paused",
      elapsedMs: this.accumulated,
      currentWpm: 0,
    };
    this.cancel();
    this.record({ type: "pause", sourceIndex: this.snapshot.sourceIndex });
    this.checkpoint();
    this.notify();
  }
  resume() {
    if (this.snapshot.status !== "paused") return;
    this.activeOrigin = this.clock.now();
    this.snapshot = {
      ...this.snapshot,
      status: "running",
      recoveryStatus: undefined,
    };
    this.record({ type: "resume", sourceIndex: this.snapshot.sourceIndex });
    this.checkpoint();
    this.notify();
    this.schedule();
  }
  stop() {
    if (this.snapshot.status !== "running" && this.snapshot.status !== "paused")
      return;
    this.accumulated = this.activeTime();
    this.snapshot = {
      ...this.snapshot,
      status: "stopped",
      elapsedMs: this.accumulated,
      currentWpm: 0,
    };
    this.cancel();
    this.record({ type: "stop", sourceIndex: this.snapshot.sourceIndex });
    this.checkpoint();
    this.notify();
  }
  reset() {
    this.cancel();
    this.plan = null;
    this.log = null;
    this.snapshot = { ...IDLE_SNAPSHOT };
    this.notify();
  }
  dispose() {
    this.cancel();
    this.listeners.clear();
  }
}
