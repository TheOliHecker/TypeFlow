"use client";
import { useEffect, useReducer } from "react";
import type { SimulationEngine, Status } from "./simulation/engine";
export type SessionMetadata = { id: string; title: string; status: Status; startedAt: string; updatedAt: string; characters: number };
const key = "typeflow-last-session-v1";
export function useSessionMetadata(engine: SimulationEngine, status: Status) {
  const [previous, setPrevious] = useReducer((_: SessionMetadata | null, value: SessionMetadata | null) => value, null);
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(key) ?? "null");
      if (raw && typeof raw.title === "string" && typeof raw.updatedAt === "string" && ["running", "paused", "stopped", "completed"].includes(raw.status)) setPrevious(raw);
    } catch {}
  }, []);
  useEffect(() => {
    if (status === "idle") return;
    const metadata = engine.getMetadata();
    if (metadata) try { localStorage.setItem(key, JSON.stringify(metadata)); } catch {}
  }, [engine, status]);
  return previous;
}
