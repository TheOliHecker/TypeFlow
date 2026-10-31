"use client";
import { useEffect, useRef, useState } from "react";
import type { SimulationEngine } from "../simulation/engine";
import { GoogleDocsOutputAdapter, webGoogleTransport } from "./adapter";
import {
  GoogleSyncCoordinator,
  loadBinding,
  newBinding,
  type SyncView,
} from "./sync";

export function useGoogleOutput(engine: SimulationEngine) {
  const [output, setOutput] = useState<"local" | "google">("local");
  const [account, setAccount] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<SyncView>({
    status: "Not connected",
    confirmedCharacters: 0,
    pending: 0,
  });
  const coordinator = useRef<GoogleSyncCoordinator | null>(null);
  const initialization = useRef<Promise<void> | null>(null);
  useEffect(() => {
    let mounted = true;
    void fetch("/api/google/status")
      .then((r) => r.json())
      .then((s) => {
        if (mounted && s.connected) {
          setAccount(s.email);
          setView((v) => ({
            ...v,
            status: v.status === "Not connected" ? "Ready" : v.status,
          }));
        }
      })
      .catch(() => {
        if (mounted) setError("Unable to check Google connection.");
      });
    const params = new URLSearchParams(window.location.search);
    queueMicrotask(() => {
      if (mounted && params.get("google_error"))
        setError(params.get("google_error")!.slice(0, 500));
    });
    return () => {
      mounted = false;
      coordinator.current?.dispose();
    };
  }, []);
  const attach = async (id: string) => {
    const binding = loadBinding(localStorage, id);
    if (!binding) {
      coordinator.current?.dispose();
      coordinator.current = null;
      setOutput("local");
      return;
    }
    setBusy(true);
    setOutput("google");
    setDocumentId(binding.documentId);
    coordinator.current?.dispose();
    const sync = new GoogleSyncCoordinator(
      engine,
      localStorage,
      webGoogleTransport,
      binding,
      setView,
    );
    coordinator.current = sync;
    try {
      await sync.initialize();
    } finally {
      setBusy(false);
    }
  };
  const create = async (title: string) => {
    setBusy(true);
    setError("");
    try {
      const adapter = new GoogleDocsOutputAdapter(webGoogleTransport);
      const state = await adapter.create(title);
      coordinator.current?.dispose();
      coordinator.current = null;
      setDocumentId(state.documentId!);
      setView({ status: "Ready", confirmedCharacters: 0, pending: 0 });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const start = async (action: () => Promise<void>) => {
    setError("");
    setBusy(true);
    initialization.current = null;
    try {
      if (output === "google") {
        if (!documentId)
          throw new Error(
            "Connect Google and create an empty document before starting.",
          );
        // Each new session requires an empty document. Never clear a prior result.
        await new GoogleDocsOutputAdapter(webGoogleTransport).initialize({
          documentId,
          text: "",
        });
      }
      if (output === "local") {
        coordinator.current?.dispose();
        coordinator.current = null;
      }
      await action();
      await initialization.current;
      initialization.current = null;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const started = () => {
    if (output !== "google") return;
    const id = engine.getMetadata()?.id;
    if (!id) throw new Error("No session was started.");
    coordinator.current?.dispose();
    engine.pause();
    localStorage.setItem(
      `typeflow-google-v1:${id}`,
      JSON.stringify(newBinding(id, documentId)),
    );
    initialization.current = attach(id).then(() => {
      if (engine.getSnapshot().status === "paused") engine.resume();
    });
  };
  const restore = (id: string) => {
    void attach(id).catch((e) => setError((e as Error).message));
  };
  const retry = async () => {
    setBusy(true);
    setError("");
    try {
      await coordinator.current?.recover();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const disconnect = async () => {
    coordinator.current?.pause();
    engine.pause();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/google/disconnect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-TypeFlow-Request": "1",
        },
        body: "{}",
      });
      if (!r.ok) throw new Error((await r.json()).error);
      coordinator.current?.dispose();
      coordinator.current = null;
      setAccount("");
      setView((v) => ({ ...v, status: "Not connected" }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return {
    output,
    setOutput: (value: "local" | "google") => {
      if (value === "local") {
        coordinator.current?.dispose();
        coordinator.current = null;
      }
      setOutput(value);
    },
    account,
    documentId,
    busy,
    error,
    view,
    create,
    start,
    started,
    restore,
    connecting: () => {
      coordinator.current?.pause();
      engine.pause();
      setView((v) => ({ ...v, status: "Connecting" }));
    },
    pause: () => {
      coordinator.current?.pause();
      engine.pause();
    },
    stop: () => {
      coordinator.current?.pause();
      engine.stop();
    },
    reset: () => {
      coordinator.current?.pause();
      engine.stop();
      engine.reset();
    },
    retry,
    disconnect,
  };
}
