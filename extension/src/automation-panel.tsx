import { RevisionPreview } from "../../src/components/revision-preview";
import { useEffect, useState } from "react";
import { GoogleDocsOutputAdapter } from "../../src/lib/google/adapter";
import {
  placementJob,
  placementPlan,
  scheduleJob,
  JOB_LOCK,
  type Block,
  type Job,
  type WindowStage,
} from "../../src/lib/automation/jobs";
import { extensionGoogleTransport } from "./google";
import { readJob, saveJob, controlJob } from "./jobs";
import { localTime, resolveLocalTime } from "../../src/lib/automation/time";
function positionGuide(source: string) {
  let offset = 0;
  const lines: string[] = [];
  for (const line of source.split(/(?<=\n)/u)) {
    lines.push(`[${offset}] ${line}`);
    offset += line.length;
  }
  return lines.join("") || "[0] Empty body";
}
const stage = (): WindowStage => ({
  name: "Draft 1",
  text: "",
  start: Date.now() + 300000,
  end: Date.now() + 3900000,
  pauseSeconds: 5,
  wpm: 45,
});
export function AutomationPanel({
  mode,
  documentId,
  disabled,
}: {
  mode: "blocks" | "schedule";
  documentId: string;
  disabled: boolean;
}) {
  const [blocks, setBlocks] = useState<Block[]>(() => [
    { id: crypto.randomUUID(), name: "Answer 1", text: "", index: 0 },
  ]);
  const [windows, setWindows] = useState<WindowStage[]>(() => [stage()]);
  const [loaded, setLoaded] = useState(false);
  const formKey = `typeflow-automation-form:${documentId}:${mode}`;
  useEffect(() => {
    void chrome.storage.local
      .get(formKey)
      .then((data) => {
        if (typeof data[formKey] === "string") {
          const saved = JSON.parse(data[formKey]);
          if (Array.isArray(saved.blocks)) setBlocks(saved.blocks);
          if (Array.isArray(saved.windows)) setWindows(saved.windows);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [formKey]);

  const [source, setSource] = useState<string | null>(null),
    [job, setJob] = useState<Job | null>(null),
    [preview, setPreview] = useState<Job | null>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [approved, setApproved] = useState(false);
  useEffect(() => {
    if (loaded)
      void chrome.storage.local
        .set({ [formKey]: JSON.stringify({ blocks, windows }) })
        .catch(() => setError("Unable to save block and schedule settings."));
  }, [loaded, formKey, blocks, windows]);
  const [recoveryStart, setRecoveryStart] = useState(() =>
      localTime(Date.now() + 300000),
    ),
    [recoveryEnd, setRecoveryEnd] = useState(() =>
      localTime(Date.now() + 3900000),
    );
  useEffect(() => {
    const refresh = () =>
      void readJob()
        .then(setJob)
        .catch(() => setError("Unable to load scheduled work."));
    refresh();
    chrome.storage.onChanged.addListener(refresh);
    return () => chrome.storage.onChanged.removeListener(refresh);
  }, []);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const invalidate = () => {
    setPreview(null);
    setApproved(false);
  };
  const patch = (i: number, value: Partial<Block>) => {
    invalidate();
    setBlocks((b) => b.map((x, n) => (n === i ? { ...x, ...value } : x)));
  };
  const patchWindow = (i: number, value: Partial<WindowStage>) => {
    invalidate();
    setWindows((w) => w.map((x, n) => (n === i ? { ...x, ...value } : x)));
  };
  const running = !!job && !["complete", "cancelled"].includes(job.status);
  return (
    <section
      className="card automation"
      aria-label={
        mode === "blocks" ? "Multi-Block placement" : "Scheduled Writing"
      }
    >
      <h2>
        {mode === "blocks"
          ? "Place each answer with confidence."
          : "Your writing. Your schedule."}
      </h2>
      <p className="hint">
        {mode === "blocks"
          ? "Load the authorized document, then choose positions in its body text. Offsets count UTF-16 units from zero. Tables, drawings and visual cursor selection are unsupported."
          : "Chrome must be running on an awake computer. Verified passage checkpoints are spread across each window; exact finish times are estimates."}
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {job && (
        <section className="job-status" aria-live="polite">
          <h3>
            {job.title} · {job.status}
          </h3>
          <a
            href={`https://docs.google.com/document/d/${encodeURIComponent(job.documentId)}/edit`}
            target="_blank"
            rel="noreferrer"
          >
            Open job document ↗
          </a>
          <p>
            Stage:{" "}
            {job.stages.find((s) => job.cursor < s.through)?.name ?? "Finished"}
          </p>
          <progress max={job.checkpoints.length} value={job.cursor} />
          <p>
            {job.cursor} / {job.checkpoints.length} verified checkpoints
          </p>
          <p>
            Next:{" "}
            {job.checkpoints[job.cursor]
              ? new Date(job.checkpoints[job.cursor].at).toLocaleString()
              : "None"}{" "}
            · {job.timezone}
          </p>
          <p>{job.message}</p>
          {running && (
            <>
              <div className="actions">
                <button onClick={() => void act(() => controlJob("pause"))}>
                  Pause schedule
                </button>
                <button
                  className="danger"
                  onClick={() => void act(() => controlJob("cancel"))}
                >
                  Emergency stop / cancel
                </button>
              </div>
              <p className="hint">
                An already submitted Google write may finish. Confirmed content
                stays in the document.
              </p>
              <details>
                <summary>Edit / recover remaining schedule</summary>
                <label>
                  New start
                  <input
                    type="datetime-local"
                    value={recoveryStart}
                    onChange={(e) => setRecoveryStart(e.target.value)}
                  />
                </label>
                <label>
                  New finish
                  <input
                    type="datetime-local"
                    value={recoveryEnd}
                    onChange={(e) => setRecoveryEnd(e.target.value)}
                  />
                </label>
                <button
                  disabled={disabled || busy}
                  onClick={() =>
                    void act(() =>
                      controlJob(
                        "resume",
                        resolveLocalTime(recoveryStart),
                        resolveLocalTime(recoveryEnd),
                      ),
                    )
                  }
                >
                  Reconcile & reschedule remaining work
                </button>
              </details>
            </>
          )}
        </section>
      )}
      <button
        disabled={disabled || busy || !documentId}
        onClick={() =>
          void act(async () => {
            const a = new GoogleDocsOutputAdapter(extensionGoogleTransport);
            const s = await a.initialize({ documentId });
            setSource(s.text);
            invalidate();
          })
        }
      >
        Read selected document
      </button>
      {source !== null && (
        <details>
          <summary>
            Document position guide · {source.length} UTF-16 units
          </summary>
          <pre className="review">{positionGuide(source)}</pre>
        </details>
      )}
      <details open={!running}>
        <summary>Stage and placement setup</summary>
        <fieldset disabled={disabled || busy || running || !loaded}>
          {mode === "blocks" ? (
            <>
              {blocks.map((b, i) => (
                <article className="block-editor" key={b.id}>
                  <label>
                    Block name
                    <input
                      value={b.name}
                      onChange={(e) => patch(i, { name: e.target.value })}
                    />
                  </label>
                  <label>
                    Text
                    <textarea
                      value={b.text}
                      onChange={(e) => patch(i, { text: e.target.value })}
                      maxLength={100000}
                    />
                  </label>
                  <label>
                    Insert before offset
                    <input
                      type="number"
                      min={0}
                      max={source?.length ?? 0}
                      value={b.index}
                      onChange={(e) =>
                        patch(i, { index: Number(e.target.value) })
                      }
                    />
                  </label>
                  <div className="actions">
                    <button
                      disabled={i === 0}
                      onClick={() => {
                        invalidate();
                        setBlocks((a) => {
                          const n = [...a];
                          [n[i - 1], n[i]] = [n[i], n[i - 1]];
                          return n;
                        });
                      }}
                    >
                      Move up
                    </button>
                    <button
                      onClick={() => {
                        invalidate();
                        setBlocks((a) => a.filter((x) => x.id !== b.id));
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </article>
              ))}
              <button
                disabled={blocks.length >= 62}
                onClick={() => {
                  invalidate();
                  setBlocks((a) => [
                    ...a,
                    {
                      id: crypto.randomUUID(),
                      name: `Answer ${a.length + 1}`,
                      text: "",
                      index: 0,
                    },
                  ]);
                }}
              >
                Add block
              </button>
            </>
          ) : (
            <>
              <p className="pill">
                Timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone} ·
                times saved as absolute instants
              </p>
              {windows.map((w, i) => (
                <article className="block-editor" key={i}>
                  <label>
                    Stage name
                    <input
                      value={w.name}
                      onChange={(e) => patchWindow(i, { name: e.target.value })}
                    />
                  </label>
                  <label>
                    Approved document at end of stage
                    <textarea
                      value={w.text}
                      maxLength={100000}
                      onChange={(e) => patchWindow(i, { text: e.target.value })}
                    />
                  </label>
                  <label>
                    Start
                    <input
                      type="datetime-local"
                      value={localTime(w.start)}
                      onChange={(e) => {
                        let n: number;
                        try {
                          n = resolveLocalTime(e.target.value);
                        } catch (e) {
                          setError((e as Error).message);
                          return;
                        }
                        if (Number.isFinite(n)) patchWindow(i, { start: n });
                      }}
                    />
                  </label>
                  <label>
                    Target finish
                    <input
                      type="datetime-local"
                      value={localTime(w.end)}
                      onChange={(e) => {
                        let n: number;
                        try {
                          n = resolveLocalTime(e.target.value);
                        } catch (e) {
                          setError((e as Error).message);
                          return;
                        }
                        if (Number.isFinite(n)) patchWindow(i, { end: n });
                      }}
                    />
                  </label>
                  <label>
                    Base pace (WPM)
                    <input
                      type="number"
                      min={20}
                      max={300}
                      value={w.wpm}
                      onChange={(e) =>
                        patchWindow(i, { wpm: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label>
                    Pause between passages (seconds)
                    <input
                      type="number"
                      min={0}
                      max={3600}
                      value={w.pauseSeconds}
                      onChange={(e) =>
                        patchWindow(i, { pauseSeconds: Number(e.target.value) })
                      }
                    />
                  </label>
                  <button
                    disabled={windows.length === 1}
                    onClick={() => {
                      invalidate();
                      setWindows((a) => a.filter((_, n) => n !== i));
                    }}
                  >
                    Remove stage
                  </button>
                </article>
              ))}
              <button
                disabled={windows.length >= 12}
                onClick={() => {
                  invalidate();
                  setWindows((a) => [
                    ...a,
                    {
                      ...stage(),
                      name: `Draft ${a.length + 1}`,
                      start: a.at(-1)!.end + 3600000,
                      end: a.at(-1)!.end + 7200000,
                    },
                  ]);
                }}
              >
                Add stage
              </button>
            </>
          )}
          <button
            disabled={source === null || !documentId}
            onClick={() =>
              void act(async () => {
                const p =
                  mode === "blocks"
                    ? placementJob(documentId, "Multi-Block", source!, blocks)
                    : scheduleJob(
                        documentId,
                        "Scheduled Writing",
                        source!,
                        windows,
                      );
                setPreview(p);
                setApproved(false);
              })
            }
          >
            Preview operations
          </button>
          {preview && (
            <div className="job-preview">
              <h3>Review {preview.checkpoints.length} checkpoints</h3>
              {mode === "schedule" &&
                windows.map((w, i) => (
                  <details key={i}>
                    <summary>{w.name} · revision groups</summary>
                    <RevisionPreview
                      before={i ? windows[i - 1].text : source!}
                      after={w.text}
                    />
                  </details>
                ))}
              {preview.stages.map((s, i) => (
                <p key={i}>
                  {s.name} · {new Date(s.start).toLocaleString()} →{" "}
                  {new Date(s.end).toLocaleTimeString()}
                </p>
              ))}
              {mode === "blocks" &&
                blocks.map((b) => (
                  <p key={b.id}>
                    {b.name} → offset {b.index} · {b.text.length} units
                  </p>
                ))}
              <details open>
                <summary>Exact proposed final document</summary>
                <pre className="review">
                  {mode === "blocks"
                    ? placementPlan(source!, blocks).text
                    : preview.target}
                </pre>
              </details>
              <label className="check">
                <input
                  type="checkbox"
                  checked={approved}
                  onChange={(e) => setApproved(e.target.checked)}
                />
                I approve all placements and revision groups in this preview.
              </label>
              <button
                className="primary"
                disabled={!approved}
                onClick={() =>
                  void act(async () => {
                    await navigator.locks.request(JOB_LOCK, async () => {
                      if (preview.checkpoints[0].at < Date.now() - 30_000)
                        throw new Error(
                          "Preview expired. Preview again with a future start.",
                        );
                      const old = await readJob();
                      if (
                        old &&
                        !["complete", "cancelled"].includes(old.status)
                      )
                        throw new Error("Cancel the existing job first.");
                      const a = new GoogleDocsOutputAdapter(
                        extensionGoogleTransport,
                      );
                      await a.initialize({ documentId, text: source! });
                      await saveJob(preview);
                      await chrome.alarms.create("typeflow-scheduled-writing", {
                        periodInMinutes: 0.5,
                      });
                    });
                    setPreview(null);
                  })
                }
              >
                {mode === "blocks"
                  ? "Confirm placements & start"
                  : "Save schedule"}
              </button>
            </div>
          )}
        </fieldset>
      </details>
    </section>
  );
}
