"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, Check, CircleHelp, FileText, Leaf, Pause, Play, RotateCcw, ShieldCheck, Square, Trash2 } from "lucide-react";
import { Brand } from "./brand";
import { SettingsPanel } from "./settings-panel";
import { useDraft } from "@/lib/use-draft";
import { formatTime, MAX_TEXT_LENGTH, SAMPLE_TEXT, wordCount } from "@/lib/types";
import { useSimulation } from "@/lib/simulation/use-simulation";
import { createPlan } from "@/lib/simulation/plan";
import { SessionResults } from "./session-results";
import { useSessionMetadata } from "@/lib/use-session-metadata";

export function Workspace() {
  const { draft, loaded, storageError, update } = useDraft();
  const { text, title, settings } = draft;
  const { engine, snapshot } = useSimulation();
  const previous = useSessionMetadata(engine, snapshot.status);
  const [error, setError] = useState("");
  const paper = useRef<HTMLDivElement>(null);
  const words = useMemo(() => wordCount(text), [text]);
  const active = snapshot.status === "running" || snapshot.status === "paused";
  const completedLog = useMemo(() => snapshot.status === "completed" ? engine.getLog() : null, [engine, snapshot.status]);
  const estimate = useMemo(() => {
    if (!text.trim()) return { ms: 0, error: "" };
    try { return { ms: createPlan(text, settings).durationMs, error: "" }; }
    catch (e) { return { ms: createPlan(text, { ...settings, durationSeconds: null }).durationMs, error: (e as Error).message }; }
  }, [text, settings]);
  const writtenWords = useMemo(() => wordCount(text.slice(0, snapshot.sourceIndex)), [text, snapshot.sourceIndex]);
  const statusText = snapshot.status === "running" ? snapshot.activity === "thinking" ? "A moment to think" : snapshot.activity === "correcting" ? "Correcting a small slip" : "In the flow" : ({ idle: "Ready when you are", paused: "Taking a little pause", stopped: "Session stopped", completed: "All your words, in place" })[snapshot.status];
  useEffect(() => {
    if (paper.current && snapshot.status === "running") paper.current.scrollTop = paper.current.scrollHeight;
  }, [snapshot.text, snapshot.status]);
  const start = () => { setError(""); try { engine.start(text, settings, title || "Untitled document"); } catch (e) { setError((e as Error).message); } };

  return <div className="workspace-page">
    <header className="workspace-header"><Brand /><div className="workspace-breadcrumb"><span>/</span> Your workspace</div><Link href="/" className="workspace-home"><ArrowLeft size={13} /> Back to home</Link><span className="private-indicator"><ShieldCheck size={14} /> Private & local</span></header>
    <main id="main" className="workspace-main">
      <div className="workspace-intro"><div><span className="eyebrow accent">A LITTLE SPACE FOR YOUR WORDS</span><h1>Find your flow<span className="accent">.</span></h1><p>Bring your words. Set the rhythm. Let them unfold.</p></div><span className="draft-status"><Check size={13} /> {storageError ? "Storage unavailable · download to keep your work" : loaded ? "Draft saved on this device" : "Loading your draft…"}</span></div>
      {error && <p className="session-error" role="alert">{error}</p>}
      {previous && snapshot.status === "idle" && <p className="restore-note">{previous.status === "running" || previous.status === "paused" ? "Your previous session was interrupted. Your draft is restored; start a new session when you’re ready." : `Last session: ${previous.title.slice(0, 120)} · ${previous.status}. Your draft is restored.`} Full replay logs are available only until you leave this page.</p>}
      <div className="workspace-grid">
        <div className="workspace-editor-column">
          <section className="input-panel">
            <div className="panel-heading"><h2><FileText size={15} /> Your words</h2><button className="text-button" disabled={active} onClick={() => { engine.reset(); update({ title: "A little room to think", text: SAMPLE_TEXT }); }}>Try an example <ArrowUpRight size={12} /></button></div>
            <label className="sr-only" htmlFor="document-title">Document title</label><input id="document-title" className="title-input" value={title} maxLength={120} placeholder="Untitled document" disabled={active} onChange={e => { engine.reset(); update({ title: e.target.value }); }} />
            <label className="sr-only" htmlFor="source-text">Text to simulate</label><textarea id="source-text" className="source-text" maxLength={MAX_TEXT_LENGTH} value={text} disabled={active} placeholder="Paste your words here. A paragraph, a first draft, a big idea…" onChange={e => { engine.reset(); update({ text: e.target.value.replace(/\r\n?/g, "\n") }); }} />
            <div className="editor-footer"><span>{words.toLocaleString()} words <i /> {text.length.toLocaleString()} / {MAX_TEXT_LENGTH.toLocaleString()} characters</span><button aria-label="Clear text" className="text-button" disabled={active} onClick={() => { engine.reset(); update({ text: "" }); }}><Trash2 size={12} /> Clear</button></div>
          </section>
          <SettingsPanel settings={settings} disabled={active} onChange={settings => update({ settings })} estimateMs={estimate.ms} durationError={estimate.error} />
          <div className="privacy-note"><ShieldCheck size={15} /><p>Your words stay right here. Drafts and preferences are stored in this browser.</p></div>
        </div>
        <div className="workspace-preview-column">
          <section className="live-panel">
            <div className="panel-heading"><h2><span className="blue-dot" /> Live preview</h2><span className="simulation-label">AUTOMATED SIMULATION</span></div>
            <div className="live-paper" ref={paper} tabIndex={0} aria-label="Simulated document preview">
              <div className="paper-topline"><span>YOUR IDEAS, IN MOTION</span><Leaf size={16} /></div><h2>{title || "Untitled document"}</h2>
              {snapshot.status === "idle" ? <div className="preview-empty"><span className="empty-cursor" /><p>A little anticipation.<br /><span>Your words will appear here, one moment at a time.</span></p></div> : <div className={`live-text ${snapshot.activity === "correcting" && active ? "is-correcting" : ""}`}>{snapshot.text}{active && <span className="typing-cursor" />}</div>}
            </div>
            <div className="live-controls">
              {snapshot.status === "running" ? <button className="button button-primary" onClick={() => engine.pause()}><Pause size={14} /> Pause</button> : snapshot.status === "paused" ? <button className="button button-primary" onClick={() => engine.resume()}><Play size={14} fill="currentColor" /> Resume</button> : <button className="button button-primary" disabled={!loaded || !text.trim() || !!estimate.error} onClick={start}><Play size={14} fill="currentColor" /> {snapshot.status === "idle" ? "Start writing" : "Start again"}</button>}
              {active && <button className="icon-button" aria-label="Stop session" title="Stop session" onClick={() => engine.stop()}><Square size={14} /></button>}
              <button className="icon-button" aria-label="Reset session" title="Reset session" disabled={snapshot.status === "idle"} onClick={() => { engine.reset(); setError(""); }}><RotateCcw size={16} /></button>
              <span role="status"><i className="status-dot" />{statusText}</span>
            </div>
          </section>
          <section className="session-panel">
            <div className="session-progress-heading"><span>Session progress</span><strong>{Math.floor(snapshot.progress)}%</strong></div><div className="session-progress" role="progressbar" aria-label="Writing progress" aria-valuenow={Math.floor(snapshot.progress)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${snapshot.progress}%` }} /></div>
            <div className="stats-grid"><div><span>WORDS WRITTEN</span><strong>{writtenWords} <small>/ {words}</small></strong></div><div><span>ELAPSED</span><strong>{formatTime(snapshot.elapsedMs)}</strong></div><div><span>REMAINING</span><strong>{formatTime(snapshot.status === "idle" ? estimate.ms : snapshot.remainingMs)}</strong></div><div><span>CURRENT PACE</span><strong>{snapshot.currentWpm || "—"} <small>WPM</small></strong></div></div>
          </section>
          {completedLog && <SessionResults key={completedLog.id} log={completedLog} />}
          <div className="honesty-note"><CircleHelp size={14} /><p>This is an automated writing simulation. Simulated activity does not establish original human authorship.</p></div>
        </div>
      </div>
      <div className="workspace-bottom"><span><Leaf size={13} /> Less rush. More rhythm.</span><span>Made with a little thought. TypeFlow.</span></div>
    </main>
  </div>;
}
