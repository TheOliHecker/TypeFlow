"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  FileText,
  MoreHorizontal,
  Pause,
  Play,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import { useSimulation } from "@/lib/simulation/use-simulation";
import { DEFAULT_SETTINGS, type Intensity } from "@/lib/types";
const passage =
  "Every great idea begins with a single word.\n\nSometimes, all it takes is a little space to think. A moment to pause. And the freedom to let your words find their own rhythm.\n\nThis is where your story begins.";
export function LandingDemo() {
  const { engine, snapshot } = useSimulation();
  const count = snapshot.sourceIndex;
  const playing = snapshot.status === "running";
  const [speed, setSpeed] = useState(45);
  const [pauses, setPauses] = useState<Intensity>("medium");
  const [typos, setTypos] = useState<Intensity>("low");
  useEffect(() => {
    engine.reset();
    engine.start(passage, { ...DEFAULT_SETTINGS, wpm: speed, pauses, typos });
  }, [engine, speed, pauses, typos]);
  const restart = () => {
    engine.reset();
    engine.start(passage, { ...DEFAULT_SETTINGS, wpm: speed, pauses, typos });
  };
  return (
    <div className="product-preview" id="preview">
      <div className="preview-top">
        <div className="window-dots">
          <i />
          <i />
          <i />
        </div>
        <span>your ideas, in motion</span>
        <span className="local-badge">
          <span /> All in your browser
        </span>
      </div>
      <div className="demo-layout">
        <aside className="demo-sidebar">
          <div className="eyebrow">YOUR WORKSPACE</div>
          <div className="demo-nav">
            <FileText size={16} /> A little room to think{" "}
            <MoreHorizontal size={16} />
          </div>
          <div className="demo-settings-heading">
            <SlidersHorizontal size={15} /> Make it your own
          </div>
          <div className="demo-label">
            Typing speed{" "}
            <strong>
              {speed} <small>WPM</small>
            </strong>
          </div>
          <input
            aria-label="Demo typing speed"
            type="range"
            min={20}
            max={120}
            value={speed}
            onChange={(e) => setSpeed(+e.target.value)}
          />
          <div className="range-labels">
            <span>Slow & steady</span>
            <span>In the flow</span>
          </div>
          <div className="demo-label spaced">
            Thinking pauses{" "}
            <select
              aria-label="Demo thinking pauses"
              value={pauses}
              onChange={(e) => setPauses(e.target.value as Intensity)}
            >
              {["off", "low", "medium", "high"].map((value) => (
                <option key={value} value={value}>
                  {value.charAt(0).toUpperCase() + value.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div className="demo-label">
            Typo corrections{" "}
            <select
              aria-label="Demo typo corrections"
              value={typos}
              onChange={(e) => setTypos(e.target.value as Intensity)}
            >
              {["off", "low", "medium", "high"].map((value) => (
                <option key={value} value={value}>
                  {value.charAt(0).toUpperCase() + value.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div className="demo-note">
            <span className="little-spark">✳</span>
            <p>
              A natural rhythm.
              <br />
              <span>A little more human in pace.</span>
            </p>
          </div>
          <Link href="/workspace" className="demo-open">
            Open your workspace <ArrowUpRight size={15} />
          </Link>
        </aside>
        <div className="demo-document">
          <div className="document-toolbar">
            <span>
              <FileText size={14} /> A little room to think
            </span>
            <span className="simulation-label">SIMULATION</span>
          </div>
          <div className="demo-paper">
            <span className="paper-category">A FRESH PERSPECTIVE</span>
            <h3>A little room to think.</h3>
            <p>
              {snapshot.text}
              <span className="typing-cursor" />
            </p>
          </div>
          <div className="demo-player">
            <button
              aria-label={
                playing
                  ? "Pause demo"
                  : count === passage.length
                    ? "Replay demo"
                    : "Play demo"
              }
              onClick={() =>
                playing
                  ? engine.pause()
                  : snapshot.status === "paused"
                    ? engine.resume()
                    : restart()
              }
              className="icon-button"
            >
              {playing && count < passage.length ? (
                <Pause size={15} fill="currentColor" />
              ) : (
                <Play size={15} fill="currentColor" />
              )}
            </button>
            <button
              className="icon-button"
              aria-label="Restart demo"
              onClick={restart}
            >
              <RotateCcw size={14} />
            </button>
            <div className="demo-progress">
              <span style={{ width: `${(count / passage.length) * 100}%` }} />
            </div>
            <span className="demo-percent">
              {Math.round((count / passage.length) * 100)}%
            </span>
            <span className="live-indicator">
              {count === passage.length ? <Check size={12} /> : <i />}
              {count === passage.length
                ? "Complete"
                : playing
                  ? "In the flow"
                  : "Paused"}
            </span>
          </div>
        </div>
      </div>
      <div className="preview-caption">
        <span>
          <span className="blue-dot" /> A live little demo. Go ahead, play with
          it.
        </span>
        <span>Automated simulation · Your words, your authorship</span>
      </div>
    </div>
  );
}
