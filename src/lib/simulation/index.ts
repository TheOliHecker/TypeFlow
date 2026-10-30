/** Portable core entrypoint. React binding lives separately in use-simulation.ts. */
export {
  SimulationEngine,
  applyEvent,
  type Clock,
  type Snapshot,
  type SessionLog,
  type SimulationEvent,
} from "./engine";
export {
  createPlan,
  type PlanEvent,
  type SimulationPlan,
  type SessionOptions,
} from "./plan";
export { validateSettings, advancedSettings } from "./settings";
export {
  planRevisions,
  type RevisionChange,
  type RevisionKind,
} from "./revisions";
export {
  applyOperation,
  eventOperation,
  MemoryAdapter,
  type EditingOperation,
  type OutputAdapter,
} from "./operations";
export { characters, diffText } from "./diff";
export { SessionReplay } from "./replay";
export {
  DEFAULT_SETTINGS,
  DEFAULT_ADVANCED,
  type SimulationSettings,
  type AdvancedSettings,
} from "../types";
