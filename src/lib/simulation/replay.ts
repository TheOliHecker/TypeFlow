import { applyEvent, type Clock, type SessionLog } from "./engine";

export type ReplaySnapshot = { status: "idle" | "playing" | "paused" | "completed"; text: string; positionMs: number; eventIndex: number; speed: number };
export const EMPTY_REPLAY: ReplaySnapshot = { status: "idle", text: "", positionMs: 0, eventIndex: 0, speed: 1 };
const clock: Clock = { now: () => performance.now(), date: () => new Date(), set: (fn, delay) => setTimeout(fn, delay), clear: id => clearTimeout(id) };

/** Replays the recorded events, including real user pauses and delayed ticks. */
export class SessionReplay {
  private snapshot: ReplaySnapshot = { ...EMPTY_REPLAY };
  private origin = 0;
  private basePosition = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<() => void>();
  readonly durationMs: number;
  constructor(readonly log: SessionLog, private time: Clock = clock) { this.durationMs = log.events.at(-1)?.atMs ?? 0; }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;
  private notify() { for (const listener of this.listeners) listener(); }
  private cancel() { if (this.timer !== null) this.time.clear(this.timer); this.timer = null; }
  private tick = () => {
    if (this.snapshot.status !== "playing") return;
    const positionMs = Math.min(this.durationMs, this.basePosition + (this.time.now() - this.origin) * this.snapshot.speed);
    let { text, eventIndex } = this.snapshot;
    let processed = 0;
    while (eventIndex < this.log.events.length && this.log.events[eventIndex].atMs <= positionMs && processed++ < 1000) text = applyEvent(text, this.log.events[eventIndex++]);
    this.snapshot = { ...this.snapshot, positionMs, text, eventIndex, status: eventIndex === this.log.events.length ? "completed" : "playing" };
    this.cancel();
    if (this.snapshot.status === "playing") this.timer = this.time.set(this.tick, 40);
    this.notify();
  };
  play() {
    if (this.snapshot.status === "playing") return;
    if (this.snapshot.status === "completed") this.snapshot = { ...EMPTY_REPLAY, speed: this.snapshot.speed };
    this.basePosition = this.snapshot.positionMs;
    this.origin = this.time.now();
    this.snapshot = { ...this.snapshot, status: "playing" };
    this.tick();
  }
  pause() {
    if (this.snapshot.status !== "playing") return;
    this.tick();
    if (this.snapshot.status === "playing") this.snapshot = { ...this.snapshot, status: "paused" };
    this.cancel();
    this.notify();
  }
  setSpeed(speed: number) {
    if (![0.5, 1, 2, 4, 8].includes(speed)) throw new Error("Unsupported replay speed.");
    const playing = this.snapshot.status === "playing";
    if (playing) this.pause();
    this.snapshot = { ...this.snapshot, speed };
    if (playing && this.snapshot.status !== "completed") this.play(); else this.notify();
  }
  reset() { this.cancel(); this.snapshot = { ...EMPTY_REPLAY, speed: this.snapshot.speed }; this.notify(); }
  dispose() { this.cancel(); this.listeners.clear(); }
}
