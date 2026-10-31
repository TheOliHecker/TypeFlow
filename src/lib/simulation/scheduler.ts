/** Deadlines are UTC epoch milliseconds, never historical execution timestamps. */
export interface Scheduler {
  readonly environment: "foreground" | "extension" | "server";
  now(): number;
  schedule(at: number, wake: () => void): void;
  cancel(): void;
}
export class ForegroundScheduler implements Scheduler {
  readonly environment = "foreground";
  private timer?: ReturnType<typeof setTimeout>;
  now = () => Date.now();
  schedule(at: number, wake: () => void) {
    this.cancel();
    this.timer = setTimeout(
      wake,
      Math.min(2_147_483_647, Math.max(0, at - this.now())),
    );
    return this.timer;
  }
  cancel() {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }
}
/** Ports only: no Chrome globals, worker keepalives, or implied exact alarm timing.
 * A worker wake must load durable state and reconcile before scheduling again.
 * Sub-30-second work needs a live execution context, not alarms alone.
 */
export interface ExtensionWakePort {
  scheduleAlarm(name: string, at: number): Promise<void>;
  clearAlarm(name: string): Promise<void>;
  onWake(listener: (name: string) => Promise<void>): () => void;
}
export interface ServerWakePort {
  enqueue(sessionId: string, at: number): Promise<void>;
  cancel(sessionId: string): Promise<void>;
}
export function eligibleOperations(
  deadlines: readonly number[],
  index: number,
  now: number,
  limit = 100,
) {
  let end = index;
  while (end < deadlines.length && deadlines[end] <= now && end - index < limit)
    end++;
  return end;
}
