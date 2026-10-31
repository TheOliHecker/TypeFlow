"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  CircleHelp,
  FileText,
  Leaf,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Square,
  Trash2,
} from "lucide-react";
import { Brand } from "./brand";
import { ProofreadingPanel } from "./proofreading-panel";
import { planRevisions } from "@/lib/simulation/revisions";
import { approvedText } from "@/lib/simulation/proofreading";
import { SettingsPanel } from "./settings-panel";
import { useDraft } from "@/lib/use-draft";
import {
  DEFAULT_SETTINGS,
  DEFAULT_PROOFREADING,
  formatTime,
  MAX_TEXT_LENGTH,
  SAMPLE_TEXT,
  wordCount,
} from "@/lib/types";
import { useSimulation } from "@/lib/simulation/use-simulation";
import { createPlan } from "@/lib/simulation/plan";
import { SessionResults } from "./session-results";
import { useGoogleOutput } from "@/lib/google/use-google-output";

export function Workspace() {
  const { draft, loaded, storageError, saving, update } = useDraft();
  const { text, title, settings } = draft;
  const twoTexts = draft.mode === "two";
  const finalText = twoTexts ? (draft.finalText ?? "") : "";
  const finalSettings = draft.finalSettings ?? DEFAULT_SETTINGS;
  const proofreading = draft.proofreading ?? DEFAULT_PROOFREADING;
  const intendedText = twoTexts ? finalText : text;
  const outputText = useMemo(
    () => approvedText(intendedText, proofreading),
    [intendedText, proofreading],
  );
  const changes = useMemo(
    () => (twoTexts ? planRevisions(text, finalText, draft.revisionMode) : []),
    [twoTexts, text, finalText, draft.revisionMode],
  );
  const options = useMemo(
    () => ({
      finalText: twoTexts ? finalText : undefined,
      finalSettings,
      revisionMode: draft.revisionMode,
      proofreading,
    }),
    [twoTexts, finalText, finalSettings, draft.revisionMode, proofreading],
  );
  const {
    engine,
    snapshot,
    recoverable,
    recoveryError,
    exclusive,
    recover,
    discard,
    cancelSession,
  } = useSimulation();
  const google = useGoogleOutput(engine);
  const [error, setError] = useState("");
  const paper = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLSpanElement>(null);
  const words = useMemo(() => wordCount(text), [text]);
  const googleWorking =
    google.output === "google" &&
    ["Writing", "Synchronizing", "Recovering"].includes(google.view.status);
  const active = snapshot.status === "running" || snapshot.status === "paused";
  const completedLog = useMemo(
    () =>
      snapshot.status === "completed" &&
      (google.output === "local" || google.view.status.startsWith("Complete"))
        ? engine.getLog()
        : null,
    [engine, snapshot.status, google.output, google.view.status],
  );
  const estimate = useMemo(() => {
    if (!text.trim() && !twoTexts) return { ms: 0, error: "" };
    try {
      return {
        ms: createPlan(text, settings, undefined, options).durationMs,
        error: "",
      };
    } catch (e) {
      return { ms: 0, error: (e as Error).message };
    }
  }, [twoTexts, text, settings, options]);
  const firstEstimate = useMemo(() => {
    if (!text.trim()) return { ms: 0, error: "" };
    try {
      return { ms: createPlan(text, settings).durationMs, error: "" };
    } catch (e) {
      return { ms: 0, error: (e as Error).message };
    }
  }, [text, settings]);
  const secondEstimate = useMemo(() => {
    if (!twoTexts) return { ms: 0, error: "" };
    try {
      const base = createPlan(
        text,
        { ...settings, durationSeconds: null },
        undefined,
        { finalText: text },
      );
      const combined = createPlan(
        text,
        { ...settings, durationSeconds: null },
        undefined,
        { finalText, finalSettings, revisionMode: draft.revisionMode },
      );
      return { ms: combined.durationMs - base.durationMs, error: "" };
    } catch (e) {
      return { ms: 0, error: (e as Error).message };
    }
  }, [twoTexts, text, settings, finalText, finalSettings, draft.revisionMode]);
  const writtenWords = wordCount(snapshot.text);
  const statusText =
    snapshot.status === "running"
      ? snapshot.activity === "thinking"
        ? (snapshot.operation ?? "A moment to think")
        : snapshot.activity === "correcting"
          ? "Correcting a small slip"
          : (snapshot.operation ?? "In the flow")
      : {
          idle: "Ready when you are",
          paused:
            snapshot.recoveryStatus === "interrupted"
              ? "Interrupted session restored · paused"
              : "Paused",
          stopped: "Session stopped",
          completed:
            google.output === "google"
              ? google.view.status
              : "Complete · All your words, in place",
          error: `Requires attention · ${snapshot.error ?? "Document verification failed"}`,
        }[snapshot.status];
  useEffect(() => {
    if (snapshot.status === "running")
      cursor.current?.scrollIntoView({ block: "nearest" });
  }, [snapshot.text, snapshot.status]);
  const start = () => {
    setError("");
    try {
      void google.start(() =>
        exclusive(() => {
          engine.start(text, settings, title || "Untitled document", options);
          google.started();
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="workspace-page">
      <header className="workspace-header">
        <Brand />
        <div className="workspace-breadcrumb">
          <span>/</span> Your workspace
        </div>
        <Link href="/" className="workspace-home">
          <ArrowLeft size={13} /> Back to home
        </Link>
        <Link href="/settings">Settings</Link>
        <span className="private-indicator">
          <ShieldCheck size={14} />{" "}
          {google.output === "google"
            ? "Google Docs output"
            : "Private & local"}
        </span>
      </header>
      <main id="main" className="workspace-main">
        <div className="workspace-intro">
          <div>
            <span className="eyebrow accent">
              A LITTLE SPACE FOR YOUR WORDS
            </span>
            <h1>
              Find your flow<span className="accent">.</span>
            </h1>
            <p>Bring your words. Set the rhythm. Let them unfold.</p>
          </div>
          <span className="draft-status">
            <Check size={13} />{" "}
            {storageError
              ? "Storage unavailable · download to keep your work"
              : loaded
                ? saving
                  ? "Saving on this device…"
                  : "Draft saved on this device"
                : "Loading your draft…"}
          </span>
        </div>
        {error && (
          <p className="session-error" role="alert">
            {error}
          </p>
        )}
        {(recoveryError || snapshot.storageError) && (
          <div className="session-error" role="alert">
            {recoveryError || snapshot.storageError}
            {!active && (
              <button className="button" onClick={() => discard()}>
                Discard saved checkpoints
              </button>
            )}
          </div>
        )}
        {!active &&
          !googleWorking &&
          recoverable.map((saved) => (
            <section className="restore-note" key={saved.id}>
              <p>
                <strong>{saved.log.title}</strong> · {saved.stage} ·{" "}
                {saved.recovery} · {Math.floor(saved.snapshot.progress)}%
              </p>
              <p>
                Last saved {new Date(saved.checkpointAt).toLocaleString()}.
                Recovery restores confirmed progress, paused.
              </p>
              <button
                className="button"
                onClick={() =>
                  void recover(saved.id, (checkpoint) => {
                    google.restore(checkpoint.id);
                    update({
                      title: checkpoint.log.title,
                      text: checkpoint.plan.initialSource,
                      mode: checkpoint.mode,
                      settings: checkpoint.log.settings,
                      finalText: checkpoint.log.options?.finalText,
                      finalSettings: checkpoint.log.options?.finalSettings,
                      proofreading: checkpoint.log.options?.proofreading,
                      revisionMode: checkpoint.log.options?.revisionMode,
                    });
                  })
                }
              >
                Resume saved session
              </button>{" "}
              <button className="button" onClick={() => discard(saved.id)}>
                Discard session
              </button>
              <details>
                <summary>Inspect saved progress</summary>
                <p>
                  {saved.operationIndex} confirmed operations · last confirmed{" "}
                  {saved.lastCompletedOperation ?? "none"}
                </p>
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    maxHeight: 200,
                    overflow: "auto",
                  }}
                >
                  {saved.snapshot.text}
                </pre>
              </details>
            </section>
          ))}
        <p className="restore-note">
          Write directly in Google Docs with the{" "}
          <Link href="/install">TypeFlow Chrome extension</Link>. This web
          workspace provides a local preview.{" "}
          <Link href="/help">Read the guide</Link>.
        </p>
        <section className="settings-panel" aria-label="Output destination">
          <label className="advanced-field">
            Output
            <select
              value={google.output}
              disabled={active || google.busy || googleWorking}
              onChange={(e) =>
                google.setOutput(e.target.value as "local" | "google")
              }
            >
              <option value="local">Local Preview</option>
              {process.env.NODE_ENV === "development" && (
                <option value="google">Google Docs · local development</option>
              )}
            </select>
          </label>
          {google.output === "google" && (
            <div>
              <p>
                {google.account
                  ? `Connected: ${google.account}`
                  : "Not connected"}
              </p>
              <form
                action="/api/google/connect"
                method="get"
                onSubmit={google.connecting}
              >
                <button className="button" type="submit">
                  {google.account ? "Reconnect Google" : "Connect Google"}
                </button>
              </form>
              {google.account && (
                <button
                  className="button"
                  disabled={
                    google.busy || google.view.status === "Synchronizing"
                  }
                  onClick={() => void google.disconnect()}
                >
                  Disconnect and revoke
                </button>
              )}
              <label className="advanced-field">
                Document title
                <input
                  value={title}
                  disabled={active || google.busy}
                  maxLength={200}
                  onChange={(e) => update({ title: e.target.value })}
                />
              </label>
              <button
                className="button"
                disabled={
                  !google.account || active || googleWorking || google.busy
                }
                onClick={() => void google.create(title)}
              >
                Create Document
              </button>{" "}
              {google.documentId && (
                <a
                  className="button"
                  href={`https://docs.google.com/document/d/${encodeURIComponent(google.documentId)}/edit`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Google Doc
                </a>
              )}
              <p role="status">
                {google.busy ? "Connecting / preparing…" : google.view.status} ·
                Stage: {snapshot.stage} · {google.view.confirmedCharacters}{" "}
                Google-confirmed characters · {google.view.pending} pending
                engine operations
              </p>
              <p>
                Last successful synchronization:{" "}
                {google.view.lastSync
                  ? new Date(google.view.lastSync).toLocaleString()
                  : "none"}
              </p>
              {(google.view.error || google.error) && (
                <p className="session-error" role="alert">
                  {google.error || google.view.error}
                </p>
              )}
              {google.view.status === "Needs attention" && (
                <button
                  className="button"
                  disabled={google.busy}
                  onClick={() => void google.retry()}
                >
                  Reconcile Google document
                </button>
              )}
              {googleWorking && !active && (
                <button className="button" onClick={google.stop}>
                  Stop synchronization
                </button>
              )}
              {snapshot.status === "completed" &&
                google.view.status.startsWith("Paused") && (
                  <button
                    className="button"
                    disabled={google.busy}
                    onClick={() => void google.retry()}
                  >
                    Reconcile and finish synchronization
                  </button>
                )}
              <p>
                Edits synchronize approximately every 30 seconds while this page
                remains open. Pausing or stopping prevents new writes; an
                in-flight request may still complete. Local preview progress is
                separate from Google-confirmed progress.
              </p>
              <p>
                Google records automated edits and controls version grouping.
                This history does not prove independent human authorship.
              </p>
            </div>
          )}
        </section>
        <div className="workspace-grid">
          <div className="workspace-editor-column">
            <section className="settings-panel mode-panel">
              <fieldset disabled={active || !loaded}>
                <label className="advanced-field">
                  Simulation mode
                  <select
                    value={draft.mode ?? "single"}
                    onChange={(e) => {
                      engine.reset();
                      update({ mode: e.target.value as "single" | "two" });
                    }}
                  >
                    <option value="single">Single text</option>
                    <option value="two">Two texts · draft evolution</option>
                  </select>
                </label>
              </fieldset>
            </section>
            <section className="input-panel">
              <div className="panel-heading">
                <h2>
                  <FileText size={15} />{" "}
                  {twoTexts ? "Type 1 · Initial draft" : "Your words"}
                </h2>
                <button
                  className="text-button"
                  disabled={active || !loaded}
                  onClick={() => {
                    engine.reset();
                    update({
                      title: "A little room to think",
                      text: SAMPLE_TEXT,
                    });
                  }}
                >
                  Try an example <ArrowUpRight size={12} />
                </button>
              </div>
              <label className="sr-only" htmlFor="document-title">
                Document title
              </label>
              <input
                id="document-title"
                className="title-input"
                value={title}
                maxLength={120}
                placeholder="Untitled document"
                disabled={active || !loaded}
                onChange={(e) => {
                  engine.reset();
                  update({ title: e.target.value });
                }}
              />
              <label className="sr-only" htmlFor="source-text">
                Text to simulate
              </label>
              <textarea
                id="source-text"
                className="source-text"
                maxLength={MAX_TEXT_LENGTH}
                value={text}
                disabled={active || !loaded}
                placeholder="Paste your words here. A paragraph, a first draft, a big idea…"
                onChange={(e) => {
                  engine.reset();
                  update({ text: e.target.value.replace(/\r\n?/g, "\n") });
                }}
              />
              <div className="editor-footer">
                <span>
                  {words.toLocaleString()} words <i />{" "}
                  {text.length.toLocaleString()} /{" "}
                  {MAX_TEXT_LENGTH.toLocaleString()} characters
                </span>
                <button
                  aria-label="Clear text"
                  className="text-button"
                  disabled={active || !loaded}
                  onClick={() => {
                    engine.reset();
                    update({ text: "" });
                  }}
                >
                  <Trash2 size={12} /> Clear
                </button>
              </div>
            </section>
            <SettingsPanel
              settings={settings}
              disabled={!loaded}
              live={active}
              label={twoTexts ? "Type 1 · Writing settings" : "Your rhythm"}
              onChange={(settings) => {
                if (active) engine.updateLiveSettings("draft", settings);
                else engine.reset();
                update({ settings });
              }}
              estimateMs={firstEstimate.ms}
              durationError={firstEstimate.error}
            />
            {twoTexts && (
              <>
                <section className="input-panel">
                  <div className="panel-heading">
                    <h2>
                      <FileText size={15} />
                      Type 2 · Final draft
                    </h2>
                  </div>
                  <label className="sr-only" htmlFor="final-text">
                    Final draft
                  </label>
                  <textarea
                    id="final-text"
                    className="source-text"
                    maxLength={MAX_TEXT_LENGTH}
                    disabled={active || !loaded}
                    value={finalText}
                    placeholder="Paste your final draft. An empty final draft removes the initial text."
                    onChange={(e) => {
                      engine.reset();
                      update({
                        finalText: e.target.value.replace(/\r\n?/g, "\n"),
                      });
                    }}
                  />
                  <div className="editor-footer">
                    {wordCount(finalText)} words ·{" "}
                    {finalText.length.toLocaleString()} /{" "}
                    {MAX_TEXT_LENGTH.toLocaleString()} characters
                  </div>
                  {!finalText.length && (
                    <p className="setting-hint">
                      An empty Type 2 draft removes all initial text.
                    </p>
                  )}
                  {twoTexts && (
                    <details className="revision-changes">
                      <summary>
                        {changes.length} planned changes · review draft
                        evolution
                      </summary>
                      {changes.length ? (
                        changes.map((c, i) => (
                          <div key={i}>
                            <small>Position {c.index}</small>
                            {c.removed && <del>{c.removed}</del>}
                            {c.inserted && <ins>{c.inserted}</ins>}
                          </div>
                        ))
                      ) : (
                        <p>Both drafts match; no revision needed.</p>
                      )}
                    </details>
                  )}
                </section>
                <SettingsPanel
                  label="Type 2 · Revision settings"
                  revisionMode={draft.revisionMode}
                  onRevisionModeChange={(revisionMode) => {
                    engine.reset();
                    update({ revisionMode });
                  }}
                  settings={finalSettings}
                  disabled={!loaded}
                  live={active}
                  onChange={(finalSettings) => {
                    if (active)
                      engine.updateLiveSettings("revision", finalSettings);
                    else engine.reset();
                    update({ finalSettings });
                  }}
                  estimateMs={secondEstimate.ms}
                  durationError={secondEstimate.error}
                />
              </>
            )}
            <ProofreadingPanel
              text={intendedText}
              settings={proofreading}
              disabled={active || !loaded}
              onChange={(proofreading) => {
                engine.reset();
                update({ proofreading });
              }}
            />
            <div className="privacy-note">
              <ShieldCheck size={15} />
              <p>
                {google.output === "google"
                  ? "Document content is sent to Google when you synchronize. Drafts and recovery checkpoints stay on this device."
                  : "Your drafts and preferences stay in this browser."}{" "}
                <Link href="/privacy">Privacy details</Link>
              </p>
            </div>
          </div>
          <div className="workspace-preview-column">
            <section className="live-panel">
              <div className="panel-heading">
                <h2>
                  <span className="blue-dot" /> Live preview
                </h2>
                <span className="simulation-label">AUTOMATED SIMULATION</span>
              </div>
              <div
                className="live-paper"
                ref={paper}
                tabIndex={0}
                aria-label="Simulated document preview"
              >
                <div className="paper-topline">
                  <span>YOUR IDEAS, IN MOTION</span>
                  <Leaf size={16} />
                </div>
                <h2>{title || "Untitled document"}</h2>
                {snapshot.status === "idle" ? (
                  <div className="preview-empty">
                    <span className="empty-cursor" />
                    <p>
                      A little anticipation.
                      <br />
                      <span>
                        Your words will appear here, one moment at a time.
                      </span>
                    </p>
                  </div>
                ) : (
                  <div
                    className={`live-text ${snapshot.activity === "correcting" && active ? "is-correcting" : ""}`}
                  >
                    {active && snapshot.editIndex !== undefined ? (
                      <>
                        {snapshot.text.slice(0, snapshot.editIndex)}
                        <span className="typing-cursor" ref={cursor} />
                        {snapshot.text.slice(snapshot.editIndex)}
                      </>
                    ) : (
                      snapshot.text
                    )}
                  </div>
                )}
              </div>
              <div className="live-controls">
                {snapshot.status === "running" ? (
                  <button
                    className="button button-primary"
                    onClick={() =>
                      google.output === "google"
                        ? google.pause()
                        : engine.pause()
                    }
                  >
                    <Pause size={14} /> Pause
                  </button>
                ) : snapshot.status === "paused" ? (
                  <button
                    className="button button-primary"
                    disabled={
                      google.output === "google" &&
                      (google.view.status === "Needs attention" ||
                        google.busy ||
                        !google.account)
                    }
                    onClick={() => engine.resume()}
                  >
                    <Play size={14} fill="currentColor" /> Resume
                  </button>
                ) : (
                  <button
                    className="button button-primary"
                    disabled={
                      !loaded ||
                      googleWorking ||
                      google.busy ||
                      google.view.status === "Synchronizing" ||
                      (google.output === "google" &&
                        (!google.documentId || !google.account)) ||
                      (!text.trim() && !(twoTexts && finalText.length)) ||
                      !!estimate.error
                    }
                    onClick={start}
                  >
                    <Play size={14} fill="currentColor" />{" "}
                    {snapshot.status === "idle"
                      ? "Start writing"
                      : "Start again"}
                  </button>
                )}
                {active && (
                  <>
                    <button
                      className="button"
                      onClick={() =>
                        google.output === "google"
                          ? google.stop()
                          : engine.emergencyStop()
                      }
                    >
                      Emergency stop
                    </button>
                    <button
                      className="button"
                      onClick={() =>
                        google.output === "google"
                          ? google.stop()
                          : cancelSession()
                      }
                    >
                      Cancel
                    </button>
                  </>
                )}
                {active && (
                  <button
                    className="icon-button"
                    aria-label="Stop session"
                    title="Stop session"
                    onClick={() =>
                      google.output === "google" ? google.stop() : engine.stop()
                    }
                  >
                    <Square size={14} />
                  </button>
                )}
                <button
                  className="icon-button"
                  aria-label="Reset session"
                  title="Reset session"
                  disabled={snapshot.status === "idle" || googleWorking}
                  onClick={() => {
                    if (google.output === "google") google.reset();
                    else cancelSession();
                    setError("");
                  }}
                >
                  <RotateCcw size={16} />
                </button>
                <span role="status">
                  <i className="status-dot" />
                  {active
                    ? `${snapshot.stage === "draft" ? "Type 1 · Drafting" : snapshot.stage === "revision" ? "Type 2 · Revising" : "Proofreading"} · ${statusText}`
                    : statusText}
                </span>
              </div>
            </section>
            {estimate.error && (
              <p className="session-error" role="alert">
                {estimate.error}
              </p>
            )}
            <p className="setting-hint">
              Local foreground scheduling: background tabs may throttle
              execution. Closed tabs and sleeping devices cannot execute. Stop
              keeps a recoverable checkpoint; Cancel discards this session and
              its checkpoint.
            </p>
            <section className="session-panel">
              <div className="session-progress-heading">
                <span>Session progress</span>
                <strong>{Math.floor(snapshot.progress)}%</strong>
              </div>
              <div
                className="session-progress"
                role="progressbar"
                aria-label="Writing progress"
                aria-valuenow={Math.floor(snapshot.progress)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span style={{ width: `${snapshot.progress}%` }} />
              </div>
              <div className="stats-grid">
                <div>
                  <span>WORDS WRITTEN</span>
                  <strong>
                    {writtenWords} <small>/ {wordCount(outputText)}</small>
                  </strong>
                </div>
                <div>
                  <span>ELAPSED</span>
                  <strong>{formatTime(snapshot.elapsedMs)}</strong>
                </div>
                <div>
                  <span>REMAINING</span>
                  <strong>
                    {formatTime(
                      snapshot.status === "idle"
                        ? estimate.ms
                        : snapshot.remainingMs,
                    )}
                  </strong>
                </div>
                <div>
                  <span>CURRENT PACE</span>
                  <strong>
                    {snapshot.currentWpm || "—"} <small>WPM</small>
                  </strong>
                </div>
              </div>
            </section>
            {completedLog && (
              <SessionResults key={completedLog.id} log={completedLog} />
            )}
            <div className="honesty-note">
              <CircleHelp size={14} />
              <p>
                This is an automated writing simulation. Simulated activity does
                not establish original human authorship.
              </p>
            </div>
          </div>
        </div>
        <div className="workspace-bottom">
          <span>
            <Leaf size={13} /> Less rush. More rhythm.
          </span>
          <span>Made with a little thought. TypeFlow.</span>
        </div>
      </main>
    </div>
  );
}
