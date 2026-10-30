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
import { diffText } from "@/lib/simulation/diff";
import { approvedText } from "@/lib/simulation/proofreading";
import { SettingsPanel } from "./settings-panel";
import { useDraft } from "@/lib/use-draft";
import {
  DEFAULT_SETTINGS,
  DEFAULT_PROOFREADING,
  type RevisionMode,
  formatTime,
  MAX_TEXT_LENGTH,
  SAMPLE_TEXT,
  wordCount,
} from "@/lib/types";
import { useSimulation } from "@/lib/simulation/use-simulation";
import { createPlan } from "@/lib/simulation/plan";
import { SessionResults } from "./session-results";
import { useSessionMetadata } from "@/lib/use-session-metadata";

export function Workspace() {
  const { draft, loaded, storageError, saving, update } = useDraft();
  const { text, title, settings } = draft;
  const twoTexts = draft.mode === "two";
  const finalText = twoTexts ? (draft.finalText ?? "") : "";
  const finalSettings = draft.finalSettings ?? DEFAULT_SETTINGS;
  const proofreading = draft.proofreading ?? DEFAULT_PROOFREADING;
  const intendedText = finalText.trim() ? finalText : text;
  const outputText = useMemo(
    () => approvedText(intendedText, proofreading),
    [intendedText, proofreading],
  );
  const changes = useMemo(
    () =>
      twoTexts && finalText.trim()
        ? diffText(text, finalText, draft.revisionMode)
        : [],
    [twoTexts, text, finalText, draft.revisionMode],
  );
  const options = useMemo(
    () => ({
      finalText,
      finalSettings,
      revisionMode: draft.revisionMode,
      proofreading,
    }),
    [finalText, finalSettings, draft.revisionMode, proofreading],
  );
  const { engine, snapshot } = useSimulation();
  const previous = useSessionMetadata(engine);
  const [error, setError] = useState("");
  const paper = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLSpanElement>(null);
  const words = useMemo(() => wordCount(text), [text]);
  const active = snapshot.status === "running" || snapshot.status === "paused";
  const completedLog = useMemo(
    () => (snapshot.status === "completed" ? engine.getLog() : null),
    [engine, snapshot.status],
  );
  const estimate = useMemo(() => {
    if (!text.trim()) return { ms: 0, error: "" };
    try {
      return {
        ms: createPlan(text, settings, undefined, options).durationMs,
        error: "",
      };
    } catch (e) {
      return { ms: 0, error: (e as Error).message };
    }
  }, [text, settings, options]);
  const firstEstimate = useMemo(() => {
    if (!text.trim()) return { ms: 0, error: "" };
    try {
      return { ms: createPlan(text, settings).durationMs, error: "" };
    } catch (e) {
      return { ms: 0, error: (e as Error).message };
    }
  }, [text, settings]);
  const secondEstimate = useMemo(() => {
    if (!finalText.trim() || !text.trim()) return { ms: 0, error: "" };
    try {
      const base = createPlan(text, { ...settings, durationSeconds: null });
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
  }, [text, settings, finalText, finalSettings, draft.revisionMode]);
  const writtenWords = wordCount(snapshot.text);
  const statusText =
    snapshot.status === "running"
      ? snapshot.activity === "thinking"
        ? "A moment to think"
        : snapshot.activity === "correcting"
          ? "Correcting a small slip"
          : "In the flow"
      : {
          idle: "Ready when you are",
          paused: "Taking a little pause",
          stopped: "Session stopped",
          completed: "All your words, in place",
        }[snapshot.status];
  useEffect(() => {
    if (snapshot.status === "running")
      cursor.current?.scrollIntoView({ block: "nearest" });
  }, [snapshot.text, snapshot.status]);
  const start = () => {
    setError("");
    try {
      engine.start(text, settings, title || "Untitled document", options);
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
        <span className="private-indicator">
          <ShieldCheck size={14} /> Private & local
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
        {previous && snapshot.status === "idle" && (
          <p className="restore-note">
            {previous.status === "running" || previous.status === "paused"
              ? "Your previous session was interrupted. Your draft is restored; start a new session when you’re ready."
              : `Last session: ${previous.title.slice(0, 120)} · ${previous.status}. Your draft is restored.`}{" "}
            Full replay logs are available only until you leave this page.
          </p>
        )}
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
              disabled={active || !loaded}
              label={twoTexts ? "Type 1 · Writing settings" : "Your rhythm"}
              onChange={(settings) => {
                engine.reset();
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
                      Type 2 · Final draft (optional)
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
                    placeholder="Paste your final draft. Leave blank to simulate only Type 1."
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
                  <fieldset disabled={active || !loaded}>
                    <label className="advanced-field">
                      Revision mode
                      <select
                        value={draft.revisionMode ?? "targeted"}
                        onChange={(e) => {
                          engine.reset();
                          update({
                            revisionMode: e.target.value as RevisionMode,
                          });
                        }}
                      >
                        <option value="targeted">Targeted edits</option>
                        <option value="paragraph">Paragraph rewrites</option>
                        <option value="full">Full rewrite</option>
                      </select>
                    </label>
                  </fieldset>
                  {!!finalText.trim() && (
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
                  settings={finalSettings}
                  disabled={active || !loaded}
                  onChange={(finalSettings) => {
                    engine.reset();
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
                Your words stay right here. Drafts and preferences are stored in
                this browser.
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
                    onClick={() => engine.pause()}
                  >
                    <Pause size={14} /> Pause
                  </button>
                ) : snapshot.status === "paused" ? (
                  <button
                    className="button button-primary"
                    onClick={() => engine.resume()}
                  >
                    <Play size={14} fill="currentColor" /> Resume
                  </button>
                ) : (
                  <button
                    className="button button-primary"
                    disabled={!loaded || !text.trim() || !!estimate.error}
                    onClick={start}
                  >
                    <Play size={14} fill="currentColor" />{" "}
                    {snapshot.status === "idle"
                      ? "Start writing"
                      : "Start again"}
                  </button>
                )}
                {active && (
                  <button
                    className="icon-button"
                    aria-label="Stop session"
                    title="Stop session"
                    onClick={() => engine.stop()}
                  >
                    <Square size={14} />
                  </button>
                )}
                <button
                  className="icon-button"
                  aria-label="Reset session"
                  title="Reset session"
                  disabled={snapshot.status === "idle"}
                  onClick={() => {
                    engine.reset();
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
