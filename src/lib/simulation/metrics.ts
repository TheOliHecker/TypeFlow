import type { SimulationEvent } from "./engine";
/** Word totals count the streams of inserted/removed operation text, including corrections. */
export class OperationCounter {
  inserted = 0;
  removed = 0;
  operations = 0;
  private inInserted = false;
  private inRemoved = false;
  add(events: readonly SimulationEvent[]) {
    for (const e of events) {
      if (e.type === "delete" || e.type === "replace" || e.type === "stage")
        this.inInserted = false;
      if (e.type === "insert" || e.type === "replace" || e.type === "stage")
        this.inRemoved = false;
      const inserted =
        e.type === "insert" || e.type === "replace" ? (e.text ?? "") : "";
      const removed =
        e.type === "delete"
          ? (e.expected ?? e.text ?? "")
          : e.type === "replace"
            ? (e.expected ?? "")
            : "";
      for (const c of inserted) {
        const word = !/\s/u.test(c);
        if (word && !this.inInserted) this.inserted++;
        this.inInserted = word;
      }
      for (const c of removed) {
        const word = !/\s/u.test(c);
        if (word && !this.inRemoved) this.removed++;
        this.inRemoved = word;
      }
      if (["insert", "delete", "replace", "verify"].includes(e.type))
        this.operations++;
    }
    return {
      inserted: this.inserted,
      removed: this.removed,
      operations: this.operations,
    };
  }
}
export function operationMetrics(events: readonly SimulationEvent[]) {
  return new OperationCounter().add(events);
}
