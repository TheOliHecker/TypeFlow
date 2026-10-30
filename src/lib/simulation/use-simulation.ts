"use client";
import {
  useEffect,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { IDLE_SNAPSHOT, SimulationEngine } from "./engine";
import { BrowserSessionStorage, type SessionCheckpoint } from "./session";

export function useSimulation() {
  const [engine] = useState(() => new SimulationEngine());
  const [recoverable, setRecoverable] = useReducer(
    (_: SessionCheckpoint[], value: SessionCheckpoint[]) => value,
    [],
  );
  const [recoveryError, setRecoveryError] = useReducer(
    (_: string, value: string) => value,
    "",
  );
  const release = useRef<(() => void) | null>(null);
  const mounted = useRef(false);
  const snapshot = useSyncExternalStore(
    engine.subscribe,
    engine.getSnapshot,
    () => IDLE_SNAPSHOT,
  );
  useEffect(() => {
    mounted.current = true;
    let store: BrowserSessionStorage;
    try {
      store = new BrowserSessionStorage(localStorage);
      setRecoverable(store.list().filter((s) => s.recovery !== "complete"));
      if (store.issues.length)
        setRecoveryError(
          `${store.issues.length} saved checkpoint(s) require attention: ${store.issues[0].error}`,
        );
      engine.setCheckpointWriter((s) => {
        store.save(s);
        if (s.recovery === "complete") store.delete(s.id);
      });
    } catch (error) {
      setRecoveryError((error as Error).message);
      engine.setCheckpointWriter(() => {
        throw new Error(
          "Storage unavailable. This session is not safely recoverable.",
        );
      });
    }
    const save = () => engine.checkpoint();
    const visibility = () => {
      if (document.visibilityState === "hidden") save();
    };
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", visibility);
    let previousStatus = engine.getSnapshot().status;
    const unsubscribe = engine.subscribe(() => {
      const status = engine.getSnapshot().status;
      if (!["running", "paused"].includes(engine.getSnapshot().status)) {
        release.current?.();
        release.current = null;
        if (previousStatus !== status) {
          try {
            setRecoverable(
              new BrowserSessionStorage(localStorage)
                .list()
                .filter((s) => s.recovery !== "complete"),
            );
          } catch (error) {
            setRecoveryError((error as Error).message);
          }
        }
      }
      previousStatus = status;
    });
    return () => {
      mounted.current = false;
      save();
      unsubscribe();
      window.removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", visibility);
      engine.dispose();
      engine.setCheckpointWriter(undefined);
      release.current?.();
      release.current = null;
    };
  }, [engine]);
  const exclusive = async (action: () => void) => {
    try {
      if (release.current) {
        action();
        return;
      }
      if (!navigator.locks)
        throw new Error(
          "This browser cannot safely lock local sessions. Use a browser with Web Locks support.",
        );
      await new Promise<void>((resolve, reject) => {
        void navigator.locks
          .request(
            "typeflow-local-executor",
            { ifAvailable: true },
            async (lock) => {
              if (!lock) {
                reject(
                  new Error(
                    "A TypeFlow session is already open in another tab. Pause and close that tab first.",
                  ),
                );
                return;
              }
              if (!mounted.current) {
                resolve();
                return;
              }
              await new Promise<void>((unlock) => {
                release.current = unlock;
                try {
                  action();
                  resolve();
                } catch (error) {
                  release.current = null;
                  unlock();
                  reject(error);
                }
              });
            },
          )
          .catch(reject);
      });
    } catch (error) {
      setRecoveryError((error as Error).message);
    }
  };
  const discard = (id?: string) => {
    void exclusive(() => {
      const store = new BrowserSessionStorage(localStorage);
      if (id) store.delete(id);
      else store.clear();
      setRecoverable(store.list().filter((s) => s.recovery !== "complete"));
      setRecoveryError("");
      if (
        engine.getSnapshot().status !== "running" &&
        engine.getSnapshot().status !== "paused"
      ) {
        release.current?.();
        release.current = null;
      }
    });
  };
  const recover = (
    id: string,
    onRecover?: (saved: SessionCheckpoint) => void,
  ) =>
    exclusive(() => {
      const saved = new BrowserSessionStorage(localStorage).load(id);
      if (!saved) throw new Error("Saved session no longer exists.");
      engine.recover(saved);
      onRecover?.(saved);
      setRecoverable([]);
      setRecoveryError("");
    });
  const cancelSession = () => {
    const id = engine.getMetadata()?.id;
    engine.cancelSession();
    if (id) discard(id);
  };
  return {
    engine,
    snapshot,
    recoverable,
    recoveryError,
    exclusive,
    recover,
    discard,
    cancelSession,
  };
}
