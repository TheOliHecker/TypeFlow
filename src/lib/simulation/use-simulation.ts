"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { IDLE_SNAPSHOT, SimulationEngine } from "./engine";
export function useSimulation() {
  const [engine] = useState(() => new SimulationEngine());
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot, () => IDLE_SNAPSHOT);
  useEffect(() => () => engine.dispose(), [engine]);
  return { engine, snapshot };
}
