"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SettingsPanel } from "./settings-panel";
import { DEFAULT_SETTINGS, type RevisionMode } from "@/lib/types";
import { createPlan, type SimulationPlan } from "@/lib/simulation/plan";
import { planRevisions } from "@/lib/simulation/revisions";
import { applyOperation, eventOperation } from "@/lib/simulation/operations";
import { diffText } from "@/lib/simulation/diff";
import {
  validateConfig,
  DEFAULT_LAB,
  INTERVALS,
  SyncLab,
  developerCall,
  csvReport,
  publicReport,
  type LabConfig,
  type Observation,
} from "@/lib/developer/lab";
import { exerciseFailure, FAILURES } from "@/lib/developer/failures";
const TABS = [
  "Overview",
  "Sync Interval Tester",
  "API Monitor",
  "Version History Inspector",
  "Typing Engine Debugger",
  "Document Validator",
  "Diagnostics & Reports",
  "Developer Settings",
];
const HISTORY = "typeflow-developer-reports-v1";
const PREFS = "typeflow-developer-settings-v1";
function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const stamp = (n?: number) => (n ? new Date(n).toLocaleString() : "—");
export function DeveloperDashboard() {
  const router = useRouter();
  const [now, setNow] = useState(0);
  const [tab, setTab] = useState(TABS[0]);
  const [config, setConfig] = useState<LabConfig>({ ...DEFAULT_LAB });
  const [sample, setSample] = useState("");
  const [error, setError] = useState("");
  const [, redraw] = useState(0);
  const [history, setHistory] = useState<unknown[]>([]);
  const [lab, setLab] = useState<SyncLab | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const starting = useRef(false);
  const refresh = () => {
    setNow(Date.now());
    redraw((n) => n + 1);
  };
  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => {
      if (!mounted) return;
      try {
        const prefs = localStorage.getItem(PREFS);
        if (prefs) setConfig({ ...DEFAULT_LAB, ...JSON.parse(prefs) });
        const saved = localStorage.getItem(HISTORY);
        if (saved) {
          if (saved.length > 500_000)
            throw new Error("Stored reports exceed capacity");
          setHistory(
            JSON.parse(saved)
              .filter(
                (item: { started: number }) =>
                  item.started > Date.now() - 30 * 86400_000,
              )
              .slice(-10),
          );
        }
        setLab(SyncLab.restore(sessionStorage, refresh));
        refresh();
      } catch {
        setError(
          "Stored diagnostics could not be loaded. Clear history to discard the checkpoint.",
        );
      }
    });
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    const timer = setInterval(() => {
      void lab
        ?.tick()
        .catch(() =>
          setError("Execution interrupted. Reconcile before resuming."),
        );
    }, 250);
    const pause = () => {
      if (document.hidden && lab?.report.status === "running")
        void lab
          .control("pause")
          .catch(() =>
            setError(
              "Paused locally. Server control unavailable; in-flight writes may complete.",
            ),
          );
    };
    document.addEventListener("visibilitychange", pause);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", pause);
      if (lab?.report.status === "running")
        void lab.control("pause").catch(() => {});
    };
  }, [lab]);
  const action = async (fn: () => Promise<unknown> | unknown) => {
    setError("");
    try {
      await fn();
      refresh();
    } catch (e) {
      setError((e as Error).message);
      refresh();
    }
  };
  const r = lab?.report;
  const active =
    r &&
    ["running", "paused", "attention", "interrupted", "ready"].includes(
      r.status,
    );
  const p = r?.phases[r.phase];
  const requests = r?.requests ?? [];
  const counts = r?.counts;
  const saveReport = () => {
    if (!r) return;
    const recent = [
      ...history.filter(
        (item) =>
          (item as { id?: string }).id !== r.id &&
          (item as { started?: number }).started! >
            Date.now() - config.retention * 86400_000,
      ),
      publicReport(r),
    ].slice(-10);
    const raw = JSON.stringify(recent);
    if (raw.length > 500_000)
      throw new Error(
        "Local report capacity exceeded (500 KB). Export and clear history.",
      );
    try {
      localStorage.setItem(HISTORY, raw);
      setHistory(recent);
    } catch {
      throw new Error(
        "Local storage capacity exceeded. Export reports before clearing.",
      );
    }
  };
  return (
    <main className="dev-shell">
      <header className="dev-header">
        <div>
          <Link href="/workspace">← Workspace</Link>
          <p className="dev-kicker">TYPEFLOW / PRIVATE LABORATORY</p>
          <h1>Developer console</h1>
        </div>
        <button
          onClick={() =>
            void action(async () => {
              if (lab && active) await lab.control("emergency");
              await developerCall("lock", {});
              sessionStorage.removeItem("typeflow-developer-active-v1");
              router.push("/settings");
            })
          }
        >
          Lock Developer Mode
        </button>
      </header>
      <p className="dev-notice">
        Local development only · Automated experiments · Keep this tab visible.
        Google controls revision grouping; API writes do not prove human
        authorship.
      </p>
      <nav className="dev-tabs" aria-label="Developer tools">
        {TABS.map((t) => (
          <button
            aria-current={tab === t ? "page" : undefined}
            key={t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>
      {error && (
        <p className="dev-error" role="alert">
          {error}
        </p>
      )}
      {r && (
        <section className="dev-card">
          <div className="dev-header">
            <h2>
              {r.status} · Phase {r.phase + 1}/{r.phases.length}
            </h2>
            <small>{r.id}</small>
          </div>
          <div className="dev-controls">
            <button
              disabled={r.status !== "running"}
              onClick={() => void action(() => lab!.control("pause"))}
            >
              Pause Test
            </button>
            <button
              disabled={
                !["paused", "attention", "interrupted"].includes(r.status) ||
                lab?.progress.busy
              }
              onClick={() => void action(() => lab!.control("resume"))}
            >
              Resume Test / Reconcile
            </button>
            <button
              disabled={!active}
              onClick={() => void action(() => lab!.control("stop"))}
            >
              Stop Test
            </button>
            <button
              className="dev-danger"
              onClick={() => void action(() => lab!.control("emergency"))}
            >
              Emergency Stop
            </button>
            <button
              onClick={() => {
                download(
                  `${r.id}.json`,
                  JSON.stringify(publicReport(r), null, 2),
                  "application/json",
                );
              }}
            >
              Export JSON
            </button>
            <button
              onClick={() => download(`${r.id}.csv`, csvReport(r), "text/csv")}
            >
              Export CSV
            </button>
            <button onClick={() => void action(saveReport)}>
              Save report locally
            </button>
          </div>
          <p>
            Stop and Emergency Stop block new writes without flushing pending
            text. An acknowledged in-flight write may still complete. Stopped
            experiments cannot resume.
          </p>
          <div className="dev-metrics">
            {Object.entries({
              Interval: `${p?.interval}s`,
              "Phase active time": `${Math.floor((p?.activeMs ?? 0) / 1000)}s`,
              "Total wall time": `${Math.floor(((r.ended ?? now) - r.started) / 1000)}s`,
              "Remaining active time": `${Math.ceil((r.config.minutes * 60_000 * r.phases.length - r.phases.reduce((n, p) => n + p.activeMs, 0)) / 1000)}s`,
              "Simulated WPM": r.config.wpm,
              "Words generated (phase)": lab?.progress.generatedWords,
              "Operations queued (character inserts)":
                lab?.progress.operationsQueued,
              "API writes attempted": counts?.attempted,
              "API writes acknowledged": counts?.confirmed,
              "Failed writes": counts?.failed,
              "Pending characters": lab?.progress.pendingCharacters,
              "Last successful update": stamp(counts?.lastSync),
              Connection:
                r.status === "attention"
                  ? "Needs reconciliation / check OAuth"
                  : lab?.progress.busy
                    ? "Request in progress"
                    : "Idle; no background polling",
            }).map(([label, value]) => (
              <div key={label}>
                <small>{label}</small>
                <strong>{value ?? "—"}</strong>
              </div>
            ))}
          </div>
          <div className="dev-controls">
            {r.phases.map(
              (phase, i) =>
                phase.documentId && (
                  <a
                    key={i}
                    href={`https://docs.google.com/document/d/${phase.documentId}/edit`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open Google Doc · phase {i + 1}
                  </a>
                ),
            )}
          </div>
        </section>
      )}
      {tab === "Overview" && (
        <section className="dev-card">
          <h2>Observe real synchronization</h2>
          <p>
            Choose intervals, run a foreground automated writing session, then
            compare acknowledged API writes with manually observed Google Docs
            versions. Boundary writes are tracked separately from normal sync
            writes.
          </p>
          <p>
            Server authentication expires after 30 minutes. Experiments are
            capped at 20 scheduled minutes and 25 wall minutes. Use the
            workspace to connect Google before starting. OAuth and document
            authorization are still required.
          </p>
          <button onClick={() => setTab("Sync Interval Tester")}>
            Configure an experiment
          </button>
          <p>
            Recent locally saved reports: {history.length}. Reports exclude
            document text; the active recovery checkpoint holds test text in
            this tab’s session storage.
          </p>
        </section>
      )}
      {tab === "Sync Interval Tester" && (
        <section className="dev-card">
          <h2>Sync interval experiment</h2>
          <fieldset disabled={!!active || isStarting}>
            <div className="dev-controls">
              {INTERVALS.map((i) => (
                <label key={i}>
                  <input
                    type="checkbox"
                    checked={config.intervals.includes(i)}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        intervals: e.target.checked
                          ? [...config.intervals, i].sort((a, b) => a - b)
                          : config.intervals.filter((v) => v !== i),
                      })
                    }
                  />{" "}
                  {i} seconds
                </label>
              ))}
            </div>
            <div className="dev-fields">
              <label>
                Duration per interval
                <select
                  value={config.minutes}
                  onChange={(e) =>
                    setConfig({ ...config, minutes: +e.target.value })
                  }
                >
                  {[2, 5, 10].map((n) => (
                    <option key={n} value={n}>
                      {n} minutes
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Simulated WPM
                <input
                  type="number"
                  min={20}
                  max={300}
                  value={config.wpm}
                  onChange={(e) =>
                    setConfig({ ...config, wpm: +e.target.value })
                  }
                />
              </label>
              <label>
                Document mode
                <select
                  value={String(config.separate)}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      separate: e.target.value === "true",
                    })
                  }
                >
                  <option value="false">One document · append phases</option>
                  <option value="true">Separate document per interval</option>
                </select>
              </label>
            </div>
            <label>
              Optional non-sensitive test text
              <textarea
                maxLength={100000}
                value={sample}
                onChange={(e) => setSample(e.target.value)}
                placeholder="Leave empty for unique, locally generated synthetic samples."
              />
            </label>
            <p>
              Provide at least {Math.ceil(config.wpm * 5 * config.minutes)}{" "}
              characters if supplying text. Scheduled duration:{" "}
              {config.intervals.length * config.minutes} minutes. All timestamps
              use actual recorded time.
            </p>
          </fieldset>
          <div className="dev-controls">
            <button
              disabled={!!active || isStarting || !!lab?.progress.busy}
              onClick={() =>
                void action(async () => {
                  if (starting.current) return;
                  starting.current = true;
                  setIsStarting(true);
                  try {
                    if (
                      sample &&
                      sample.length < Math.ceil(config.wpm * 5 * config.minutes)
                    )
                      throw new Error(
                        "Test text is too short for this phase duration and WPM.",
                      );
                    const instance = new SyncLab(
                      config,
                      sessionStorage,
                      refresh,
                      sample,
                    );
                    setLab(instance);
                    await instance.start();
                  } catch (e) {
                    setLab(null);
                    throw e;
                  } finally {
                    starting.current = false;
                    setIsStarting(false);
                  }
                })
              }
            >
              Start Test
            </button>
            <button
              disabled={!!active}
              onClick={() => {
                setConfig({ ...DEFAULT_LAB });
                setSample("");
              }}
            >
              Reset Configuration
            </button>
          </div>
        </section>
      )}
      {tab === "API Monitor" && (
        <section className="dev-card">
          <h2>API monitor</h2>
          <div className="dev-metrics">
            {Object.entries({
              "Requests / last minute": requests.filter(
                (e) => e.started > now - 60000,
              ).length,
              "Average write latency": `${Math.round((counts?.latencyTotal ?? 0) / Math.max(1, counts?.attempted ?? 0))} ms`,
              "Max write latency": `${counts?.maxLatency ?? 0} ms`,
              "Failed requests": requests.filter((e) => e.outcome === "failed")
                .length,
              "Retry rate": `${Math.round(((counts?.retries ?? 0) / Math.max(1, counts?.attempted ?? 0)) * 100)}%`,
            }).map(([k, v]) => (
              <div key={k}>
                <small>{k}</small>
                <strong>{v}</strong>
              </div>
            ))}
          </div>
          <p>
            Live request metadata from the actual transport; no Google polling.
            HTTP 200 means the API acknowledged the request; integrity checks
            are recorded separately. Logging{" "}
            {config.logging ? "enabled" : "disabled"}.
          </p>
          <div className="dev-table">
            <table>
              <thead>
                <tr>
                  {[
                    "Request / session",
                    "Phase / document",
                    "Action / kind",
                    "Started / completed",
                    "Latency",
                    "HTTP",
                    "Retry",
                    "Queue / outcome",
                    "Revision",
                  ].map((v) => (
                    <th key={v}>{v}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {requests
                  .slice(-100)
                  .reverse()
                  .map((e) => (
                    <tr key={e.id}>
                      <td>
                        {e.id}
                        <small>{e.sessionId}</small>
                      </td>
                      <td>
                        {e.phase + 1}
                        <small>{e.documentId ?? "Creating document"}</small>
                      </td>
                      <td>
                        {e.action} / {e.kind}
                      </td>
                      <td>
                        {stamp(e.started)}
                        <small>{stamp(e.completed)}</small>
                      </td>
                      <td>{e.completed ? e.completed - e.started : "…"} ms</td>
                      <td>{e.status ?? "—"}</td>
                      <td>{e.retry}</td>
                      <td>{e.outcome}</td>
                      <td>{e.revision ?? "Unavailable"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <h3>Live event log</h3>
          {r?.events.slice(-15).map((e, i) => (
            <p key={i}>
              <time>{stamp(e.at)}</time> · {e.message}
            </p>
          ))}
        </section>
      )}
      {tab === "Version History Inspector" && (
        <section className="dev-card">
          <h2>Manual version observations</h2>
          <p>
            Open each test document, choose File → Version history → See version
            history, then expand available groups. Google determines grouping.
            These are empirical observations, not guarantees; TypeFlow cannot
            fetch the complete expanded history.
          </p>
          <div className="dev-table">
            <table>
              <caption>
                Empirical interval comparison · boundary writes excluded
              </caption>
              <thead>
                <tr>
                  {[
                    "Interval",
                    "Submitted",
                    "Acknowledged",
                    "Observed versions",
                    "Requests / version",
                    "Average latency",
                    "Error rate",
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r?.phases.map((phase, i) => {
                  const entries = requests.filter(
                    (e) =>
                      e.phase === i &&
                      e.action === "batch" &&
                      e.kind === "sync",
                  );
                  const confirmed = entries.filter(
                    (e) => e.outcome === "acknowledged",
                  ).length;
                  return (
                    <tr key={i}>
                      <td>{phase.interval}s</td>
                      <td>{entries.length}</td>
                      <td>{confirmed}</td>
                      <td>{phase.observation?.visible ?? "—"}</td>
                      <td>
                        {phase.observation?.visible
                          ? (
                              entries.length / phase.observation.visible
                            ).toFixed(2)
                          : "—"}
                      </td>
                      <td>
                        {entries.length
                          ? Math.round(
                              entries.reduce(
                                (n, e) =>
                                  n + ((e.completed ?? e.started) - e.started),
                                0,
                              ) / entries.length,
                            )
                          : 0}{" "}
                        ms
                      </td>
                      <td>
                        {entries.length
                          ? Math.round(
                              ((entries.length - confirmed) / entries.length) *
                                100,
                            )
                          : 0}
                        %
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {r?.phases.map((phase, i) => (
            <ObservationForm
              key={`${r.id}:${i}`}
              value={phase.observation}
              interval={phase.interval}
              index={i}
              writes={requests.filter(
                (e) =>
                  e.phase === i && e.action === "batch" && e.kind === "sync",
              )}
              onChange={(o) => {
                phase.observation = o;
                refresh();
              }}
            />
          )) ?? (
            <p>
              Start an experiment to associate observations with its phases.
            </p>
          )}
        </section>
      )}
      {tab === "Typing Engine Debugger" && <EngineDebugger />}
      {tab === "Document Validator" && <Validator lab={lab} action={action} />}
      {tab === "Diagnostics & Reports" && (
        <section className="dev-card">
          <h2>Local failure laboratory</h2>
          <FailureLab />
          <h2>Saved reports</h2>
          <p>
            At most ten reports / 500 KB, retained up to {config.retention}{" "}
            days. Full document text and freeform notes are excluded from
            exports. Keep observation timestamps free of private information.
          </p>
          <button
            onClick={() =>
              download(
                "typeflow-recent-reports.json",
                JSON.stringify(history, null, 2),
                "application/json",
              )
            }
          >
            Export saved reports
          </button>
          <pre>
            {JSON.stringify(
              history.map((item) => {
                const v = item as {
                  id: string;
                  started: number;
                  status: string;
                };
                return {
                  id: v.id,
                  started: stamp(v.started),
                  status: v.status,
                };
              }),
              null,
              2,
            )}
          </pre>
        </section>
      )}
      {tab === "Developer Settings" && (
        <section className="dev-card">
          <h2>Experiment defaults & retention</h2>
          <fieldset disabled={!!active}>
            <div className="dev-fields">
              <label>
                Default sync interval
                <select
                  value={config.intervals[0] ?? 30}
                  onChange={(e) =>
                    setConfig({ ...config, intervals: [+e.target.value] })
                  }
                >
                  {INTERVALS.map((i) => (
                    <option key={i}>{i}</option>
                  ))}
                </select>
              </label>
              <label>
                Default phase duration
                <select
                  value={config.minutes}
                  onChange={(e) =>
                    setConfig({ ...config, minutes: +e.target.value })
                  }
                >
                  {[2, 5, 10].map((i) => (
                    <option key={i} value={i}>
                      {i} minutes
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Default WPM
                <input
                  type="number"
                  min={20}
                  max={300}
                  value={config.wpm}
                  onChange={(e) =>
                    setConfig({ ...config, wpm: +e.target.value })
                  }
                />
              </label>
              {(
                [
                  ["maxMinutes", "Maximum total minutes", 2, 20],
                  ["maxDocuments", "Maximum documents", 1, 8],
                  ["retention", "Retention days", 1, 30],
                ] as const
              ).map(([key, label, min, max]) => (
                <label key={key}>
                  {label}
                  <input
                    type="number"
                    min={min}
                    max={max}
                    value={config[key]}
                    onChange={(e) =>
                      setConfig({ ...config, [key]: +e.target.value })
                    }
                  />
                </label>
              ))}
            </div>
            <label>
              <input
                type="checkbox"
                checked={config.logging}
                onChange={(e) =>
                  setConfig({ ...config, logging: e.target.checked })
                }
              />{" "}
              Record diagnostic request metadata and event log
            </label>
            <button
              onClick={() =>
                void action(() => {
                  validateConfig(config);
                  localStorage.setItem(PREFS, JSON.stringify(config));
                })
              }
            >
              Save developer defaults
            </button>
          </fieldset>
          <button
            className="dev-danger"
            disabled={!!active || !!lab?.progress.busy}
            onClick={() =>
              void action(() => {
                lab?.clearCheckpoint();
                sessionStorage.removeItem("typeflow-developer-active-v1");
                localStorage.removeItem(HISTORY);
                setHistory([]);
                setLab(null);
              })
            }
          >
            Clear diagnostic history and recovery checkpoint
          </button>
          <p>
            These defaults only affect experiments. Google quotas remain
            server-configured. Clearing local history does not delete Google
            documents.
          </p>
        </section>
      )}
    </main>
  );
}
function ObservationForm({
  value,
  onChange,
  interval,
  index,
  writes,
}: {
  value?: Observation;
  onChange: (o: Observation) => void;
  interval: number;
  index: number;
  writes: NonNullable<SyncLab["report"]>["requests"];
}) {
  const v = value ?? {
    visible: 0,
    expanded: 0,
    grouped: false,
    timestamps: "",
    notes: "",
  };
  const confirmed = writes.filter((w) => w.outcome === "acknowledged").length;
  return (
    <section className="dev-card">
      <h3>
        Phase {index + 1} · {interval}s interval
      </h3>
      <div className="dev-fields">
        <label>
          Visible version entries
          <input
            type="number"
            min={0}
            value={v.visible}
            onChange={(e) =>
              onChange({ ...v, visible: Math.max(0, +e.target.value) })
            }
          />
        </label>
        <label>
          Expanded entries
          <input
            type="number"
            min={0}
            value={v.expanded}
            onChange={(e) =>
              onChange({ ...v, expanded: Math.max(0, +e.target.value) })
            }
          />
        </label>
        <label>
          Visible timestamps (no private text)
          <input
            maxLength={500}
            value={v.timestamps}
            onChange={(e) => onChange({ ...v, timestamps: e.target.value })}
          />
        </label>
      </div>
      <label>
        <input
          type="checkbox"
          checked={v.grouped}
          onChange={(e) => onChange({ ...v, grouped: e.target.checked })}
        />{" "}
        Multiple API writes appear grouped
      </label>
      <label>
        Behavior, missing changes, unexpected updates (memory only; excluded
        from exports)
        <textarea
          maxLength={2000}
          value={v.notes}
          onChange={(e) => onChange({ ...v, notes: e.target.value })}
        />
      </label>
      <p>
        Sync writes submitted: {writes.length} · Acknowledged: {confirmed} ·
        Requests / observed version:{" "}
        {v.visible ? (writes.length / v.visible).toFixed(2) : "—"} · Average
        latency:{" "}
        {writes.length
          ? Math.round(
              writes.reduce(
                (n, w) => n + ((w.completed ?? w.started) - w.started),
                0,
              ) / writes.length,
            )
          : 0}{" "}
        ms · Error rate:{" "}
        {writes.length
          ? Math.round(((writes.length - confirmed) / writes.length) * 100)
          : 0}
        %
      </p>
    </section>
  );
}
function EngineDebugger() {
  const [text, setText] = useState(
    "The observatory records a clear and quiet morning.",
  );
  const [final, setFinal] = useState(
    "The observatory records a bright and quiet morning.",
  );
  const [settings, setSettings] = useState({ ...DEFAULT_SETTINGS });
  const [mode, setMode] = useState<RevisionMode>("smart");
  const [result, setResult] = useState<{
    plan: SimulationPlan;
    output: string;
  } | null>(null);
  const [error, setError] = useState("");
  return (
    <section className="dev-card">
      <h2>Core Engine 3.0 debugger</h2>
      <p>
        Accelerated local plan execution. No Google transport or API requests.
        Operation times are planned simulation offsets, not real API timestamps.
      </p>
      <label>
        Draft 1
        <textarea
          maxLength={10000}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <label>
        Draft 2 (optional)
        <textarea
          maxLength={10000}
          value={final}
          onChange={(e) => setFinal(e.target.value)}
        />
      </label>
      <SettingsPanel
        settings={settings}
        onChange={setSettings}
        disabled={false}
        estimateMs={result?.plan.durationMs ?? 0}
        revisionMode={mode}
        onRevisionModeChange={setMode}
      />
      <button
        onClick={() => {
          try {
            const plan = createPlan(
              text,
              settings,
              settings.advanced?.seed,
              final
                ? {
                    finalText: final,
                    finalSettings: settings,
                    revisionMode: mode,
                  }
                : {},
            );
            let output = "";
            for (const e of plan.events)
              output = applyOperation(output, eventOperation(e));
            setResult({ plan, output });
            setError("");
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        Run accelerated local simulation
      </button>
      <p role="alert">{error}</p>
      {result && (
        <>
          <h3>Typo category distribution</h3>
          <pre>
            {JSON.stringify(
              result.plan.events.reduce(
                (counts, e) => {
                  if (e.typoCategory)
                    counts[e.typoCategory] = (counts[e.typoCategory] ?? 0) + 1;
                  return counts;
                },
                {} as Record<string, number>,
              ),
              null,
              2,
            )}
          </pre>
          <p>
            {result.plan.events.length} operations ·{" "}
            {result.plan.events.filter((e) => e.correction).length} correction
            events ·{" "}
            {result.plan.events.filter((e) => e.type === "thinking").length}{" "}
            pauses
          </p>
          <h3>Final output</h3>
          <pre>{result.output}</pre>
          <h3>
            Generated operations, timestamps, corrections & stages (first 2,000)
          </h3>
          <pre>
            {JSON.stringify(result.plan.events.slice(0, 2000), null, 2)}
          </pre>
          <h3>Draft 1 → Draft 2 revision classifications</h3>
          <pre>
            {JSON.stringify(planRevisions(text, final || text, mode), null, 2)}
          </pre>
          <p>
            Kind labels: character, word, phrase, sentence rewrite, paragraph
            rewrite, added (insertion), removed (deletion), reordered.
          </p>
        </>
      )}
    </section>
  );
}
function Validator({
  lab,
  action,
}: {
  lab: SyncLab | null;
  action: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [expected, setExpected] = useState("");
  const [result, setResult] = useState<Awaited<
    ReturnType<SyncLab["validate"]>
  > | null>(null);
  return (
    <section className="dev-card">
      <h2>Document integrity</h2>
      <p>
        Reads the current phase’s authorized TypeFlow test document. Supported
        plain text only. Empty approved text uses the latest generated
        checkpoint. This tool never overwrites mismatches. Pause first for a
        stable comparison.
      </p>
      <label>
        Approved final text (optional override)
        <textarea
          maxLength={100000}
          value={expected}
          onChange={(e) => setExpected(e.target.value)}
        />
      </label>
      <button
        disabled={!lab || lab.report.status === "running" || lab.progress.busy}
        onClick={() =>
          void action(async () => {
            setResult(await lab!.validate(expected || undefined));
          })
        }
      >
        Retrieve and compare exact text
      </button>
      {result && (
        <>
          <h3>{result.result.match ? "Exact match" : "Document differs"}</h3>
          <pre>{JSON.stringify(result.result, null, 2)}</pre>
          <p>
            Difference counts cover the changed span; missing and extra spans
            may include replacements. Duplication is a heuristic. Unicode is
            compared exactly, with NFC equivalence reported separately.
          </p>
          <h3>
            Readable diff (private, displayed locally; excluded from reports)
          </h3>
          {diffText(result.expected, result.actual).map((c, i) => (
            <pre key={i}>
              At UTF-16 offset {c.index}
              {"\n"}
              <del>{JSON.stringify(c.removed)}</del>
              {"\n"}
              <ins>{JSON.stringify(c.inserted)}</ins>
            </pre>
          ))}
        </>
      )}
    </section>
  );
}
function FailureLab() {
  const [failure, setFailure] = useState(FAILURES[0]);
  const [result, setResult] = useState<unknown>(null);
  return (
    <>
      <p>
        Inject a named failure into the shared AdapterExecutor using a local
        preview adapter. No quota violations or Google API calls. These probes
        exercise blocking and reconciliation; they do not emulate the full OAuth
        or HTTP retry stack.
      </p>
      <select value={failure} onChange={(e) => setFailure(e.target.value)}>
        {FAILURES.map((f) => (
          <option key={f}>{f}</option>
        ))}
      </select>
      <button onClick={() => void exerciseFailure(failure).then(setResult)}>
        Run local failure probe
      </button>
      <pre>
        {result
          ? JSON.stringify(result, null, 2)
          : "Select a failure to inspect pending-operation handling."}
      </pre>
    </>
  );
}
