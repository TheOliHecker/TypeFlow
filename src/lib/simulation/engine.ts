import { type SimulationSettings } from "../types";
import { createPlan, type PlanEvent, type SimulationPlan } from "./plan";

export type Status = "idle" | "running" | "paused" | "stopped" | "completed";
export type SimulationEvent = Omit<PlanEvent, "scheduledMs" | "type"> & {
  type: PlanEvent["type"] | "start" | "pause" | "resume" | "stop" | "complete";
  atMs: number;
  activeMs: number;
  timestamp: string;
  scheduledMs?: number;
};
export type SessionLog = {
  schemaVersion: 1;
  kind: "automated-writing-simulation";
  authorshipNotice: string;
  id: string;
  title: string;
  source: string;
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
};

/** Clock injection makes timer drift, suspension, and cleanup testable. */
export type Clock = {
  now: () => number;
  date: () => Date;
  set: (fn: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clear: (id: ReturnType<typeof setTimeout>) => void;
};
const browserClock: Clock = {
  now: () => performance.now(),
  date: () => new Date(),
  set: (fn, delay) => setTimeout(fn, delay),
  clear: (id) => clearTimeout(id),
};

export function applyEvent(
  text: string,
  event: Pick<SimulationEvent, "type" | "text">,
): string {
  if (event.type === "insert") return text + (event.text ?? "");
  // Generated mistakes are a single ASCII character, never a user grapheme.
  if (event.type === "delete") return text.slice(0, -1);
  return text;
}

/** One owner, one timer. Processes deadlines against a monotonic active clock. */
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
  constructor(private clock: Clock = browserClock) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getLog = (): SessionLog | null =>
    this.log ? structuredClone(this.log) : null;
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
  ) {
    if (this.snapshot.status === "running" || this.snapshot.status === "paused")
      return false;
    const plan = createPlan(text, settings);
    this.cancel();
    this.plan = plan;
    this.index = 0;
    this.accumulated = 0;
    this.origin = this.activeOrigin = this.clock.now();
    const startedAt = this.clock.date().toISOString();
    this.log = {
      schemaVersion: 1,
      kind: "automated-writing-simulation",
      authorshipNotice:
        "Automated simulation of supplied text. Event timestamps record actual browser activity; they do not prove original human authorship.",
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `session-${this.clock.date().getTime()}`,
      title,
      source: plan.source,
      settings: { ...settings },
      startedAt,
      events: [],
    };
    this.snapshot = {
      ...IDLE_SNAPSHOT,
      status: "running",
      remainingMs: plan.durationMs,
      currentWpm: plan.effectiveWpm,
    };
    this.record({ type: "start", sourceIndex: 0 });
    this.notify();
    this.schedule();
    return true;
  }
  private schedule() {
    this.cancel();
    if (this.snapshot.status === "running")
      this.timer = this.clock.set(this.tick, 40);
  }
  private tick = () => {
    if (this.snapshot.status !== "running" || !this.plan) return;
    const elapsedMs = this.activeTime();
    let text = this.snapshot.text;
    let sourceIndex = this.snapshot.sourceIndex;
    let activity = this.snapshot.activity;
    let processed = 0;
    // Bound work after background-tab throttling. All overdue events still retain
    // their actual processing timestamps instead of invented historical times.
    while (
      this.index < this.plan.events.length &&
      this.plan.events[this.index].scheduledMs <= elapsedMs &&
      processed < 1000
    ) {
      const event = this.plan.events[this.index++];
      text = applyEvent(text, event);
      sourceIndex = event.sourceIndex;
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
      progress: (sourceIndex / this.plan.source.length) * 100,
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
    this.notify();
  };
  pause() {
    if (this.snapshot.status !== "running") return;
    this.tick();
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
    this.notify();
  }
  resume() {
    if (this.snapshot.status !== "paused") return;
    this.activeOrigin = this.clock.now();
    this.snapshot = { ...this.snapshot, status: "running" };
    this.record({ type: "resume", sourceIndex: this.snapshot.sourceIndex });
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
