"use client";
import { useId, useState } from "react";
import { advancedSettings } from "@/lib/simulation/plan";
import { ChevronDown, Clock3, SlidersHorizontal, Sparkles } from "lucide-react";
import {
  formatTime,
  TYPO_CATEGORIES,
  type AdvancedSettings,
  type Intensity,
  type SimulationSettings,
} from "@/lib/types";
export function SettingsPanel({
  settings,
  onChange,
  disabled,
  live = false,
  estimateMs,
  durationError,
  label = "Your rhythm",
  revisionMode,
  onRevisionModeChange,
}: {
  settings: SimulationSettings;
  onChange: (s: SimulationSettings) => void;
  disabled: boolean;
  live?: boolean;
  estimateMs: number;
  durationError?: string;
  label?: string;
  revisionMode?: import("@/lib/types").RevisionMode;
  onRevisionModeChange?: (mode: import("@/lib/types").RevisionMode) => void;
}) {
  const id = useId();
  const [customPreset, setCustomPreset] = useState(false);
  const a = advancedSettings(settings);
  const advanced = (value: Partial<AdvancedSettings>) =>
    onChange({ ...settings, advanced: { ...a, ...value } });
  return (
    <section className="settings-panel">
      <div className="panel-heading">
        <h2>
          <SlidersHorizontal size={15} /> {label}
        </h2>
        <span>MAKE IT YOURS</span>
      </div>
      <fieldset disabled={disabled}>
        <label className="advanced-field">
          Speed preset
          <select
            value={
              !customPreset &&
              [30, 50, 90, 140, 220, 300].includes(settings.wpm)
                ? settings.wpm
                : "custom"
            }
            onChange={(e) => {
              setCustomPreset(e.target.value === "custom");
              if (e.target.value !== "custom")
                onChange({ ...settings, wpm: +e.target.value });
            }}
          >
            <option value="30">Slow · 30 WPM</option>
            <option value="50">Normal · 50 WPM</option>
            <option value="90">Fast · 90 WPM</option>
            <option value="140">Very Fast · 140 WPM</option>
            <option value="220">Accelerated automation · 220 WPM</option>
            <option value="300">Accelerated automation · 300 WPM</option>
            <option value="custom">Custom · use slider</option>
          </select>
        </label>
        <label className="speed-heading" htmlFor={`${id}-wpm`}>
          Typing speed{" "}
          <strong>
            {settings.wpm}
            <small> WPM</small>
          </strong>
        </label>
        <input
          id={`${id}-wpm`}
          type="range"
          min="20"
          max="300"
          value={settings.wpm}
          onChange={(e) => {
            setCustomPreset(true);
            onChange({ ...settings, wpm: +e.target.value });
          }}
        />
        <div className="range-labels">
          <span>20 · Thoughtful</span>
          <span>300 · Accelerated automation</span>
        </div>
        <label className="checkbox-label">
          <input
            type="checkbox"
            disabled={live}
            checked={settings.variation}
            onChange={(e) =>
              onChange({ ...settings, variation: e.target.checked })
            }
          />{" "}
          Natural speed variation <Sparkles size={12} />
        </label>
        {(
          [
            ["pauses", "Thinking pauses", "A moment for ideas to breathe."],
            [
              "typos",
              "Typo frequency",
              "Small slips, automatically corrected.",
            ],
          ] as const
        ).map(([key, label, detail]) => (
          <div className="setting-row" key={key}>
            <div>
              <label htmlFor={`${id}-${key}`}>{label}</label>
              <p>{detail}</p>
            </div>
            <div className="select-wrap">
              <select
                id={`${id}-${key}`}
                value={settings[key]}
                onChange={(e) =>
                  onChange({ ...settings, [key]: e.target.value as Intensity })
                }
              >
                {["off", "low", "medium", "high"].map((v) => (
                  <option key={v} value={v}>
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </option>
                ))}
              </select>
              <ChevronDown size={12} />
            </div>
          </div>
        ))}
        {live && (
          <p className="setting-hint">
            Live changes affect future operations. Typo frequency changes at
            untouched word boundaries (word/immediate corrections); deferred
            correction plans keep their existing slips. Custom duration is
            superseded by live pace.
          </p>
        )}
        <fieldset disabled={live} style={{ border: 0, padding: 0, margin: 0 }}>
          <details className="advanced-settings">
            <summary>Advanced settings</summary>
            {onRevisionModeChange && (
              <>
                <label className="advanced-field">
                  Revision strategy
                  <select
                    value={revisionMode ?? "smart"}
                    onChange={(e) =>
                      onRevisionModeChange(
                        e.target.value as import("@/lib/types").RevisionMode,
                      )
                    }
                  >
                    <option value="smart">Smart</option>
                    <option value="targeted">Minimal edits</option>
                    <option value="paragraph">Paragraph rewrite</option>
                    <option value="full">Full rewrite</option>
                  </select>
                </label>
                <label className="advanced-field">
                  Major rewrite behavior
                  <select
                    value={a.majorRewrite ?? "insert-first"}
                    onChange={(e) =>
                      advanced({
                        majorRewrite: e.target
                          .value as AdvancedSettings["majorRewrite"],
                      })
                    }
                  >
                    <option value="delete-first">
                      Delete first, then insert
                    </option>
                    <option value="insert-first">
                      Insert first, then delete
                    </option>
                    <option value="replace">Replace selection</option>
                  </select>
                </label>
              </>
            )}
            <p className="setting-hint">
              Timing ranges are customizable simulation choices. Base WPM uses
              five characters per word; pauses and corrections reduce effective
              WPM. Session duration also includes revisions.
            </p>
            <p className="setting-hint">
              Category weights are relative. Frequency controls the chance of a
              slip per word.
            </p>
            {TYPO_CATEGORIES.map((category) => (
              <div className="category-control" key={category}>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={a.categories[category]}
                    onChange={(e) =>
                      advanced({
                        categories: {
                          ...a.categories,
                          [category]: e.target.checked,
                        },
                      })
                    }
                  />
                  {
                    {
                      nearby: "Nearby keys",
                      missing: "Missing characters",
                      repeated: "Repeated characters",
                      transposed: "Transposed characters",
                      additional: "Additional characters",
                      spelling: "Spelling slips",
                      capitalization: "Capitalization errors",
                      punctuation: "Optional punctuation errors",
                    }[category]
                  }
                </label>
                <label>
                  Weight{" "}
                  <input
                    aria-label={`${category} relative weight`}
                    type="number"
                    min="0"
                    max="100"
                    value={a.probabilities[category]}
                    onChange={(e) =>
                      advanced({
                        probabilities: {
                          ...a.probabilities,
                          [category]: +e.target.value,
                        },
                      })
                    }
                  />
                </label>
              </div>
            ))}
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={a.typoProbability !== null}
                onChange={(e) =>
                  advanced({ typoProbability: e.target.checked ? 0.1 : null })
                }
              />
              Custom typo probability
            </label>
            {a.typoProbability !== null && (
              <label className="advanced-field">
                Chance per word (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={a.typoProbability * 100}
                  onChange={(e) =>
                    advanced({ typoProbability: +e.target.value / 100 })
                  }
                />
              </label>
            )}
            <label className="advanced-field">
              Correct simulated slips
              <select
                value={a.correctionTiming}
                onChange={(e) =>
                  advanced({
                    correctionTiming: e.target
                      .value as AdvancedSettings["correctionTiming"],
                  })
                }
              >
                <option value="immediate">Immediately after mistake</option>
                <option value="word">End of word</option>
                <option value="sentence">End of sentence</option>
                <option value="proofreading">
                  Proofreading pass after this stage
                </option>
              </select>
            </label>
            <label className="advanced-field">
              Correction method
              <select
                value={a.correctionMethod}
                onChange={(e) =>
                  advanced({
                    correctionMethod: e.target
                      .value as AdvancedSettings["correctionMethod"],
                  })
                }
              >
                <option value="backspace">Natural backspacing</option>
                <option value="replace">Select, delete and retype</option>
              </select>
            </label>
            {(
              [
                ["sentenceMinMs", "Minimum sentence pause (ms)"],
                ["sentenceMaxMs", "Maximum sentence pause (ms)"],
                ["paragraphMinMs", "Minimum paragraph pause (ms)"],
                ["paragraphMaxMs", "Maximum paragraph pause (ms)"],
                ["variationPercent", "Speed variation (%)"],
                ["seed", "Repeatable random seed"],
              ] as const
            ).map(([key, title]) => (
              <label className="advanced-field" key={key}>
                {title}
                <input
                  type="number"
                  min={key === "seed" ? undefined : 0}
                  max={
                    key === "variationPercent"
                      ? 90
                      : key === "seed"
                        ? undefined
                        : 600000
                  }
                  value={a[key]}
                  onChange={(e) => advanced({ [key]: +e.target.value })}
                />
              </label>
            ))}
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={a.longerBreaks}
                onChange={(e) => advanced({ longerBreaks: e.target.checked })}
              />
              Occasional longer thinking breaks
            </label>
            <div className="duration-section">
              <label htmlFor={`${id}-duration`}>
                <Clock3 size={14} /> Session duration
              </label>
              <div className="duration-tabs">
                <button
                  className={
                    settings.durationSeconds === null ? "selected" : ""
                  }
                  onClick={() =>
                    onChange({ ...settings, durationSeconds: null })
                  }
                >
                  Automatic
                </button>
                <button
                  className={
                    settings.durationSeconds !== null ? "selected" : ""
                  }
                  onClick={() =>
                    onChange({
                      ...settings,
                      durationSeconds: Math.max(
                        1,
                        Math.ceil(estimateMs / 1000),
                      ),
                    })
                  }
                >
                  Custom
                </button>
              </div>
              {settings.durationSeconds !== null && (
                <div className="duration-input">
                  <input
                    id={`${id}-duration`}
                    aria-label="Custom duration in seconds"
                    type="number"
                    min="1"
                    max="604800"
                    value={settings.durationSeconds}
                    onChange={(e) =>
                      onChange({
                        ...settings,
                        durationSeconds: Math.max(
                          1,
                          Math.min(604800, Number(e.target.value) || 1),
                        ),
                      })
                    }
                  />
                  <span>seconds</span>
                </div>
              )}
              <div className="estimate-row">
                <span>Estimated duration</span>
                <strong>{formatTime(estimateMs)}</strong>
              </div>
              {durationError ? (
                <p role="alert" className="field-error">
                  {durationError}
                </p>
              ) : (
                <p className="setting-hint">
                  {settings.durationSeconds === null
                    ? "A natural estimate. Timing may vary slightly."
                    : "Custom duration adjusts the base pace within 20–300 WPM. Browser timing may vary."}
                </p>
              )}
            </div>
          </details>
        </fieldset>
        <div className="estimate-row">
          <span>Estimated stage duration</span>
          <strong>{formatTime(estimateMs)}</strong>
        </div>
        {durationError && (
          <p role="alert" className="field-error">
            {durationError}
          </p>
        )}
      </fieldset>
    </section>
  );
}
