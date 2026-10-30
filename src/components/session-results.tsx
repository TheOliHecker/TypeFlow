"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ArrowDownToLine,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import { type SessionLog } from "@/lib/simulation/engine";
import { EMPTY_REPLAY, SessionReplay } from "@/lib/simulation/replay";
import {
  createDocx,
  downloadBlob,
  exportLog,
  exportText,
  safeFilename,
} from "@/lib/export";
import { formatTime } from "@/lib/types";

export function SessionResults({ log }: { log: SessionLog }) {
  const [replay] = useState(() => new SessionReplay(log));
  const state = useSyncExternalStore(
    replay.subscribe,
    replay.getSnapshot,
    () => EMPTY_REPLAY,
  );
  const [page, setPage] = useState(0);
  const [message, setMessage] = useState("");
  const [exporting, setExporting] = useState(false);
  const replayPaper = useRef<HTMLDivElement>(null);
  useEffect(() => () => replay.dispose(), [replay]);
  useEffect(() => {
    if (replayPaper.current && state.status === "playing")
      replayPaper.current.scrollTop = replayPaper.current.scrollHeight;
  }, [state.text, state.status]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(log.source);
      setMessage("Copied to clipboard.");
    } catch {
      setMessage("Clipboard unavailable. Download a TXT file instead.");
    }
  };
  const docx = async () => {
    setExporting(true);
    setMessage("");
    try {
      downloadBlob(await createDocx(log), `${safeFilename(log.title)}.docx`);
      setMessage("Word document downloaded.");
    } catch {
      setMessage(
        "The Word export could not be created. Try again or download TXT.",
      );
    } finally {
      setExporting(false);
    }
  };
  const pages = Math.ceil(log.events.length / 50);
  return (
    <div className="results-area">
      <section className="export-panel">
        <div>
          <span className="completion-icon">
            <Check size={15} />
          </span>
          <div>
            <h3>A little flow, a finished document.</h3>
            <p>Keep your words. Take them anywhere.</p>
          </div>
        </div>
        <div className="export-actions">
          <button
            className="button button-outline"
            onClick={() => exportText(log)}
          >
            <FileText size={13} /> TXT
          </button>
          <button
            className="button button-outline"
            disabled={exporting}
            onClick={docx}
          >
            <Download size={13} /> {exporting ? "Creating…" : "DOCX"}
          </button>
          <button className="button button-outline" onClick={copy}>
            <Copy size={13} /> Copy
          </button>
        </div>
        {message && (
          <p className="export-message" role="status">
            {message}
          </p>
        )}
      </section>
      <section className="replay-panel">
        <div className="panel-heading">
          <h2>
            <RotateCcw size={14} /> Every moment, replayable
          </h2>
          <span>RECORDED SESSION</span>
        </div>
        <div className="replay-content">
          <div className="replay-toolbar">
            <button
              className="button button-primary"
              onClick={() =>
                state.status === "playing" ? replay.pause() : replay.play()
              }
            >
              {state.status === "playing" ? (
                <Pause size={13} />
              ) : (
                <Play size={13} />
              )}
              {state.status === "playing"
                ? "Pause replay"
                : state.status === "paused"
                  ? "Resume replay"
                  : "Replay session"}
            </button>
            <button
              className="icon-button"
              aria-label="Reset replay"
              onClick={() => replay.reset()}
            >
              <RotateCcw size={14} />
            </button>
            <label htmlFor="playback-speed" className="sr-only">
              Replay speed
            </label>
            <select
              id="playback-speed"
              value={state.speed}
              onChange={(e) => replay.setSpeed(+e.target.value)}
            >
              {[0.5, 1, 2, 4, 8].map((speed) => (
                <option key={speed} value={speed}>
                  {speed}× speed
                </option>
              ))}
            </select>
            <span>
              {formatTime(state.positionMs)} / {formatTime(replay.durationMs)}
            </span>
          </div>
          <div
            className="replay-paper"
            ref={replayPaper}
            tabIndex={0}
            aria-label="Replay document"
          >
            {state.text || (
              <span className="replay-placeholder">
                Your recorded words will unfold here.
              </span>
            )}
            {state.status === "playing" && <span className="typing-cursor" />}
          </div>
          <div
            className="session-progress"
            role="progressbar"
            aria-label="Replay progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(
              replay.durationMs
                ? (state.positionMs / replay.durationMs) * 100
                : 0,
            )}
          >
            <span
              style={{
                width: `${replay.durationMs ? (state.positionMs / replay.durationMs) * 100 : 0}%`,
              }}
            />
          </div>
          <p className="replay-note">
            Replay uses actual recorded timing, including pauses. Full logs are
            kept in memory for this page only.
          </p>
        </div>
        <details className="event-details">
          <summary>
            <span>{log.events.length.toLocaleString()} timestamped events</span>
            <span>
              Explore the log <ChevronRight size={12} />
            </span>
          </summary>
          <div className="event-table-wrap">
            <table>
              <caption className="sr-only">
                Automated simulation event log, page {page + 1} of {pages}
              </caption>
              <thead>
                <tr>
                  <th>Elapsed</th>
                  <th>Event</th>
                  <th>Content</th>
                  <th>Actual timestamp</th>
                </tr>
              </thead>
              <tbody>
                {log.events
                  .slice(page * 50, page * 50 + 50)
                  .map((event, index) => (
                    <tr key={page * 50 + index}>
                      <td>{(event.atMs / 1000).toFixed(2)}s</td>
                      <td>
                        {event.type}
                        {event.correction ? " · correction" : ""}
                      </td>
                      <td>
                        <code>
                          {event.text ? JSON.stringify(event.text) : "—"}
                        </code>
                      </td>
                      <td>{event.timestamp}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div className="event-pagination">
            <button
              className="icon-button"
              aria-label="Previous event page"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft size={15} />
            </button>
            <span>
              Page {page + 1} of {pages}
            </span>
            <button
              className="icon-button"
              aria-label="Next event page"
              disabled={page + 1 >= pages}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </details>
        <div className="log-download">
          <span>Transparent by design. Every event is labeled automated.</span>
          <button className="text-button" onClick={() => exportLog(log)}>
            <ArrowDownToLine size={12} /> Export JSON log
          </button>
        </div>
      </section>
    </div>
  );
}
