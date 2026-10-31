import { controlJob } from "./jobs";
import { AutomationPanel } from "./automation-panel";
import { RevisionPreview } from "../../src/components/revision-preview";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createRoot } from "react-dom/client";
import { SettingsPanel } from "../../src/components/settings-panel";
import { ProofreadingPanel } from "../../src/components/proofreading-panel";
import { validateDraft } from "../../src/lib/use-draft";
import {
  DEFAULT_SETTINGS,
  DEFAULT_PROOFREADING,
  MAX_TEXT_LENGTH,
  formatTime,
  wordCount,
  type Draft,
} from "../../src/lib/types";
import { createPlan } from "../../src/lib/simulation/plan";
import { planRevisions } from "../../src/lib/simulation/revisions";
import { approvedText } from "../../src/lib/simulation/proofreading";
import { loadBinding } from "../../src/lib/google/sync";
import { GoogleDocsOutputAdapter } from "../../src/lib/google/adapter";
import { ExtensionStorage, OWNER_LOCK, BACKGROUND_ERROR } from "./storage";
import { PanelController } from "./controller";
import {
  token,
  listDocuments,
  disconnectGoogle,
  extensionGoogleTransport,
  type AuthorizedDocument,
} from "./google";
import "./panel.css";

declare const TYPEFLOW_WEBSITE_URL: string;
const emptyDraft: Draft = {
  title: "Untitled document",
  text: "",
  settings: DEFAULT_SETTINGS,
  mode: "single",
  finalText: "",
  finalSettings: DEFAULT_SETTINGS,
  revisionMode: "smart",
  proofreading: DEFAULT_PROOFREADING,
};
function download(
  text: string,
  name: string,
  type = "text/plain;charset=utf-8",
) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Panel({ controller: c }: { controller: PanelController }) {
  const [draft, setDraft] = useState<Draft>(() => {
    try {
      const saved = c.storage.getItem("typeflow-extension-draft");
      return saved ? validateDraft(JSON.parse(saved)) : emptyDraft;
    } catch {
      return emptyDraft;
    }
  });
  const snapshot = useSyncExternalStore(
    c.engine.subscribe,
    c.engine.getSnapshot,
  );
  const [, redraw] = useState(0);
  useEffect(() => c.subscribe(() => redraw((n) => n + 1)), [c]);
  const [mode, setMode] = useState<
    "write" | "evolution" | "blocks" | "schedule"
  >(() => (draft.mode === "two" ? "evolution" : "write"));
  useEffect(() => {
    const listener = (
      m: { type?: string },
      _: unknown,
      reply: (v: boolean) => void,
    ) => {
      if (m.type === "typeflow-job-idle")
        reply(
          !["running", "paused"].includes(c.engine.getSnapshot().status) &&
            !["Writing", "Synchronizing", "Recovering"].includes(c.view.status),
        );
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [c]);
  const [destination, setDestination] = useState("google");
  const [connected, setConnected] = useState(false);
  const [documents, setDocuments] = useState<AuthorizedDocument[]>([]);
  const [nextPage, setNextPage] = useState<string>();
  const [documentId, setDocumentId] = useState("");
  const [busy, setBusy] = useState(false);
  const actionInFlight = useRef(false);
  const [error, setError] = useState(c.storage.getItem(BACKGROUND_ERROR) ?? "");
  const [background, setBackground] = useState(
    c.storage.getItem("typeflow-background-enabled") !== "false",
  );
  const [reviewed, setReviewed] = useState(false);
  const [approvedRevision, setApprovedRevision] = useState("");
  const revisionSignature = draft.text + "\u0000" + draft.finalText;
  const [eraseConfirmation, setEraseConfirmation] = useState(false);
  const active = snapshot.status === "running" || snapshot.status === "paused";
  const syncStatus = c.view.status;
  const synchronizing =
    !!c.sync &&
    ["Writing", "Synchronizing", "Recovering"].includes(c.view.status);
  const locked = active || busy || synchronizing;
  const two = draft.mode === "two";
  const target = useMemo(
    () =>
      approvedText(
        two ? (draft.finalText ?? "") : draft.text,
        draft.proofreading ?? DEFAULT_PROOFREADING,
      ),
    [two, draft.finalText, draft.text, draft.proofreading],
  );
  const changes = useMemo(
    () =>
      two
        ? planRevisions(draft.text, draft.finalText ?? "", draft.revisionMode)
        : [],
    [two, draft.text, draft.finalText, draft.revisionMode],
  );
  const estimateResult = useMemo(() => {
    try {
      const plan = createPlan(draft.text, draft.settings, undefined, {
        finalText: draft.mode === "two" ? (draft.finalText ?? "") : undefined,
        finalSettings: draft.finalSettings,
        revisionMode: draft.revisionMode,
        proofreading: draft.proofreading,
      });
      const firstMs =
        plan.events.findLast((e) => e.stage === "draft")?.scheduledMs ?? 0;
      const revisionEnd =
        plan.events.findLast((e) => e.stage === "revision")?.scheduledMs ??
        firstMs;
      return {
        ms: plan.durationMs,
        firstMs,
        secondMs: Math.max(0, revisionEnd - firstMs),
        error: "",
      };
    } catch (e) {
      return { ms: 0, firstMs: 0, secondMs: 0, error: (e as Error).message };
    }
  }, [draft]);
  const estimate = estimateResult.ms,
    estimateError = estimateResult.error;
  const update = (value: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...value }));
    setReviewed(false);
  };
  const act = async (action: () => Promise<unknown>) => {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      actionInFlight.current = false;
      setBusy(false);
      redraw((n) => n + 1);
    }
  };
  const refresh = async (more = false) => {
    const result = await listDocuments(more ? nextPage : undefined);
    setDocuments((d) => (more ? [...d, ...result.files] : result.files));
    setNextPage(result.nextPageToken);
  };
  useEffect(() => {
    c.storage.setItem("typeflow-extension-draft", JSON.stringify(draft));
    void c.storage.flush().catch((e) => setError((e as Error).message));
  }, [draft, c]);
  useEffect(() => {
    void token()
      .then(() => {
        setConnected(true);
        return refresh();
      })
      .catch(() => {});
    const checkpoint = () => {
      c.engine.checkpoint();
      void c.storage.flush().catch(() => {});
    };
    window.addEventListener("pagehide", checkpoint);
    return () => window.removeEventListener("pagehide", checkpoint);
    // Check silently on open. Interactive consent only follows a button click.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c]);
  const { recoverable, recoveryIssue } = useMemo(() => {
    if (
      ["running", "paused"].includes(snapshot.status) ||
      busy ||
      ["Writing", "Synchronizing", "Recovering"].includes(syncStatus)
    )
      return { recoverable: [], recoveryIssue: "" };
    const rows = c.sessions.list().map((saved) => {
      try {
        const binding = loadBinding(c.storage, saved.id);
        return {
          saved:
            saved.recovery !== "complete" || (binding && !binding.complete)
              ? saved
              : null,
          damaged: false,
        };
      } catch {
        return { saved, damaged: true };
      }
    });
    return {
      recoverable: rows.flatMap((row) => (row.saved ? [row.saved] : [])),
      recoveryIssue: rows.some((row) => row.damaged)
        ? "A Google recovery checkpoint is damaged. Inspect the document and export your draft before deleting local data."
        : "",
    };
    // Full checkpoint validation runs at lifecycle boundaries, not on each typing frame.
  }, [c, snapshot.status, busy, syncStatus]);
  const metrics = c.engine.getOperationMetrics();
  const remoteDone = c.view.status.startsWith("Complete");
  return (
    <>
      <header>
        <a
          href={TYPEFLOW_WEBSITE_URL}
          target="_blank"
          rel="noreferrer"
          className="brand"
        >
          <span className="mark">≋</span> TypeFlow
          <span className="accent">.</span>
        </a>
        <a
          href={`${TYPEFLOW_WEBSITE_URL}/help`}
          target="_blank"
          rel="noreferrer"
        >
          Help ↗
        </a>
        <button
          aria-label="Toggle color theme"
          onClick={() => {
            document.documentElement.dataset.theme =
              document.documentElement.dataset.theme === "light"
                ? "dark"
                : "light";
          }}
        >
          ◐
        </button>
      </header>
      <main>
        <div className="intro">
          <span className="eyebrow">YOUR WORDS, IN MOTION</span>
          <h1>Your writing, in control.</h1>
          <p>Bring your text. Set the rhythm. Stay in control.</p>
        </div>
        {(error ||
          c.storageError ||
          snapshot.error ||
          snapshot.storageError) && (
          <div className="error" role="alert">
            {error || c.storageError || snapshot.error || snapshot.storageError}
          </div>
        )}
        {(c.sessions.issues.length > 0 || recoveryIssue) && (
          <p className="error" role="alert">
            {recoveryIssue ||
              "A saved checkpoint is damaged. Export your draft and inspect the Google document. Delete local data to remove unusable checkpoints."}
          </p>
        )}
        {!active && recoverable.length > 0 && (
          <section className="card">
            <h2>Pick up where you left off</h2>
            {recoverable.map((s) => (
              <div className="saved" key={s.id}>
                <strong>{s.log.title}</strong>
                <small>
                  {Math.floor(s.snapshot.progress)}% · saved{" "}
                  {new Date(s.checkpointAt).toLocaleString()}
                </small>
                <div className="actions">
                  <button
                    disabled={busy || synchronizing}
                    onClick={() =>
                      void act(async () => {
                        const binding = loadBinding(c.storage, s.id);
                        setDraft(
                          validateDraft({
                            title: s.log.title,
                            text: s.plan.initialSource,
                            mode: s.mode,
                            settings: s.log.settings,
                            ...s.log.options,
                          }),
                        );
                        setDestination(binding ? "google" : "local");
                        setDocumentId(binding?.documentId ?? "");
                        await c.recover(s.id);
                      })
                    }
                  >
                    Restore paused
                  </button>
                  <button
                    disabled={busy || synchronizing}
                    onClick={() => void act(() => c.discard(s.id))}
                  >
                    Discard checkpoint
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}
        <section className="card">
          <div className="section-title">
            <h2>1. Choose your destination</h2>
            <span className={`pill ${connected ? "good" : ""}`}>
              {connected ? "Google connected" : "Local & private"}
            </span>
          </div>
          <label>
            Output
            <select
              disabled={locked}
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            >
              <option value="google">Google Docs</option>
              <option value="local">Local preview</option>
            </select>
          </label>
          {destination === "google" && (
            <>
              <p className="hint">
                Connect the Google account signed into Chrome. TypeFlow can
                access only files authorized for this app.
              </p>
              <div className="actions">
                <button
                  disabled={
                    busy ||
                    snapshot.status === "running" ||
                    c.view.status === "Synchronizing"
                  }
                  onClick={() =>
                    void act(async () => {
                      await token(true);
                      setConnected(true);
                      await refresh();
                    })
                  }
                >
                  {connected ? "Reconnect Google" : "Connect Google"}
                </button>
                {connected && (
                  <button
                    disabled={busy || c.view.status === "Synchronizing"}
                    onClick={() =>
                      void act(async () => {
                        await c.pause();
                        await controlJob("pause");
                        await disconnectGoogle();
                        setConnected(false);
                        setDocuments([]);
                      })
                    }
                  >
                    Disconnect & revoke
                  </button>
                )}
              </div>
              <label>
                Authorized document
                <select
                  aria-label="Authorized document"
                  disabled={locked || !connected}
                  value={documentId}
                  onChange={(e) => setDocumentId(e.target.value)}
                >
                  <option value="">Select a blank document…</option>
                  {documentId &&
                    !documents.some((d) => d.id === documentId) && (
                      <option value={documentId}>
                        Current session document
                      </option>
                    )}
                  {documents.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="actions">
                <button
                  disabled={locked || !connected}
                  onClick={() =>
                    void act(async () => {
                      const state = await new GoogleDocsOutputAdapter(
                        extensionGoogleTransport,
                      ).create(draft.title);
                      setDocumentId(state.documentId!);
                      await refresh();
                    })
                  }
                >
                  Create blank document
                </button>
                <button
                  disabled={locked || !connected}
                  onClick={() => void act(() => refresh())}
                >
                  Refresh
                </button>
                {nextPage && (
                  <button
                    disabled={locked}
                    onClick={() => void act(() => refresh(true))}
                  >
                    Load more
                  </button>
                )}
              </div>
              {documentId && (
                <a
                  className="document-link"
                  href={`https://docs.google.com/document/d/${encodeURIComponent(documentId)}/edit`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open selected Google Doc ↗
                </a>
              )}
              <p className="hint">
                Write and Draft Evolution start in blank, plain-text documents.
                Multi-Block and Schedule support existing body text. Existing
                writing is preserved. This list includes files already
                authorized for TypeFlow; it does not browse your whole Drive.
              </p>
            </>
          )}
        </section>
        <nav className="mode-nav" aria-label="Writing mode">
          {(
            [
              ["write", "Write"],
              ["evolution", "Draft Evolution"],
              ["blocks", "Multi-Block"],
              ["schedule", "Schedule"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              disabled={locked}
              aria-pressed={mode === id}
              onClick={() => {
                setMode(id);
                update({ mode: id === "evolution" ? "two" : "single" });
              }}
            >
              {label}
            </button>
          ))}
        </nav>
        {mode === "blocks" || mode === "schedule" ? (
          <AutomationPanel
            key={documentId + mode}
            mode={mode}
            documentId={documentId}
            disabled={locked || !connected}
          />
        ) : (
          <>
            <section className="card">
              <h2>2. Bring your words</h2>
              <fieldset disabled={locked}>
                <label>
                  Mode
                  <select
                    value={draft.mode}
                    onChange={(e) => {
                      setMode(e.target.value === "two" ? "evolution" : "write");
                      update({ mode: e.target.value as Draft["mode"] });
                    }}
                  >
                    <option value="single">Single Text</option>
                    <option value="two">Draft Evolution</option>
                  </select>
                </label>
                <label>
                  Document title
                  <input
                    maxLength={120}
                    value={draft.title}
                    onChange={(e) => update({ title: e.target.value })}
                  />
                </label>
                <label>
                  {two ? "Initial draft" : "Your text"}
                  <textarea
                    aria-label={two ? "Initial draft" : "Your text"}
                    value={draft.text}
                    maxLength={MAX_TEXT_LENGTH}
                    placeholder="Paste the words you want to write…"
                    onChange={(e) =>
                      update({ text: e.target.value.replace(/\r\n?/g, "\n") })
                    }
                  />
                </label>
                <small>
                  {wordCount(draft.text)} words ·{" "}
                  {draft.text.length.toLocaleString()} / 100,000 characters
                </small>
                {two && (
                  <label>
                    Final draft
                    <textarea
                      aria-label="Final draft"
                      value={draft.finalText ?? ""}
                      maxLength={MAX_TEXT_LENGTH}
                      placeholder="Paste your revised draft…"
                      onChange={(e) =>
                        update({
                          finalText: e.target.value.replace(/\r\n?/g, "\n"),
                        })
                      }
                    />
                    <small>
                      An empty final draft removes the initial text. Review
                      below before starting.
                    </small>
                  </label>
                )}
              </fieldset>
            </section>
            <details className="card settings-disclosure">
              <summary>
                3. Set your rhythm <span>{draft.settings.wpm} WPM</span>
              </summary>
              <SettingsPanel
                settings={draft.settings}
                onChange={(settings) => {
                  if (active) c.engine.updateLiveSettings("draft", settings);
                  update({ settings });
                }}
                disabled={busy || (synchronizing && !active)}
                live={active}
                estimateMs={estimateResult.firstMs}
                label={two ? "Initial draft rhythm" : "Writing rhythm"}
              />
              {two && (
                <SettingsPanel
                  settings={draft.finalSettings ?? DEFAULT_SETTINGS}
                  onChange={(finalSettings) => {
                    if (active)
                      c.engine.updateLiveSettings("revision", finalSettings);
                    update({ finalSettings });
                  }}
                  disabled={busy || (synchronizing && !active)}
                  live={active}
                  estimateMs={estimateResult.secondMs}
                  label="Revision rhythm"
                  revisionMode={draft.revisionMode}
                  onRevisionModeChange={(revisionMode) =>
                    update({ revisionMode })
                  }
                />
              )}
              <ProofreadingPanel
                text={two ? (draft.finalText ?? "") : draft.text}
                settings={draft.proofreading ?? DEFAULT_PROOFREADING}
                onChange={(proofreading) => update({ proofreading })}
                disabled={locked}
              />
            </details>
            <section className="card">
              <h2>4. Review & start</h2>
              <p className="hint">
                Estimated active time: {formatTime(estimate)}. Google
                checkpoints sync about every 30 seconds; pending edits may take
                longer to finish.
              </p>
              <details>
                <summary>
                  Preview approved final text
                  {two ? ` · ${changes.length} planned changes` : ""}
                </summary>
                {two && (
                  <RevisionPreview
                    key={revisionSignature}
                    before={draft.text}
                    after={draft.finalText ?? ""}
                    onApproval={(ok) =>
                      setApprovedRevision(ok ? revisionSignature : "")
                    }
                  />
                )}
                <pre className="review-text">
                  {target || "(Empty final document)"}
                </pre>
                {two &&
                  changes.map((change, i) => (
                    <div className="change" key={i}>
                      {change.removed && <del>{change.removed}</del>}
                      {change.inserted && <ins>{change.inserted}</ins>}
                    </div>
                  ))}
              </details>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  disabled={locked}
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                />{" "}
                I reviewed the text and planned changes.
              </label>
              {destination === "google" && (
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={background}
                    disabled={locked}
                    onChange={(e) => {
                      setBackground(e.target.checked);
                      c.storage.setItem(
                        "typeflow-background-enabled",
                        String(e.target.checked),
                      );
                      void c.storage
                        .flush()
                        .catch((e) => setError((e as Error).message));
                    }}
                  />{" "}
                  Finish saved synchronization after the panel closes.
                </label>
              )}
              {estimateError &&
                (draft.text.length > 0 || target.length > 0) && (
                  <p className="error" role="alert">
                    {estimateError}
                  </p>
                )}
              <div className="actions controls">
                {snapshot.status === "running" ? (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => void act(() => c.pause())}
                  >
                    Pause
                  </button>
                ) : snapshot.status === "paused" ? (
                  <button
                    className="primary"
                    disabled={
                      busy ||
                      (!!c.sync &&
                        (!connected || c.view.status === "Needs attention"))
                    }
                    onClick={() => void act(() => c.resume(background))}
                  >
                    Resume
                  </button>
                ) : (
                  <button
                    className="primary"
                    disabled={
                      locked ||
                      !reviewed ||
                      (two &&
                        changes.some((c) => c.major) &&
                        approvedRevision !== revisionSignature) ||
                      !!estimateError ||
                      (!draft.text.length && !target.length) ||
                      (destination === "google" && (!connected || !documentId))
                    }
                    onClick={() =>
                      void act(() =>
                        c.start(
                          draft,
                          documentId,
                          destination === "google",
                          background,
                        ),
                      )
                    }
                  >
                    Start writing
                  </button>
                )}
                {(active || synchronizing) && (
                  <button
                    disabled={busy}
                    onClick={() => void act(() => c.pause(true))}
                  >
                    Stop
                  </button>
                )}
              </div>
            </section>
          </>
        )}
        {(mode === "write" || mode === "evolution") && (
          <section className="card progress-card" aria-label="Session progress">
            <div className="section-title">
              <h2>In the flow</h2>
              <span className="pill">
                {snapshot.status} · {snapshot.stage}
              </span>
            </div>
            <progress
              aria-label="Writing progress"
              value={snapshot.progress}
              max={100}
            />
            <div className="metrics">
              <span>{Math.floor(snapshot.progress)}% stage completion</span>
              <span>{wordCount(snapshot.text)} final document words</span>
              <span>
                {metrics.inserted} words inserted · {metrics.removed} removed
              </span>
              <span>{metrics.operations} operations completed</span>
              <span>{formatTime(snapshot.elapsedMs)} elapsed</span>
              <span>{formatTime(snapshot.remainingMs)} left</span>
            </div>
            <div className="paper" tabIndex={0} aria-label="Live preview">
              {snapshot.text || "Your words will appear here."}
            </div>
            {c.sync && (
              <div className="sync-state" role="status">
                <strong>{c.view.status}</strong>
                <p>
                  {c.view.confirmedCharacters.toLocaleString()} Google-confirmed
                  characters · {c.view.pending} pending operations
                </p>
                <small>
                  Last confirmed:{" "}
                  {c.view.lastSync
                    ? new Date(c.view.lastSync).toLocaleTimeString()
                    : "Waiting for first checkpoint"}
                </small>
                {c.view.error && (
                  <p className="error" role="alert">
                    {c.view.error}
                  </p>
                )}
                {(c.view.status === "Needs attention" ||
                  c.view.status.startsWith("Paused")) && (
                  <button
                    disabled={busy || !connected}
                    onClick={() =>
                      void act(async () => {
                        await c.reconcile();
                        await c.sync!.synchronizeCheckpoint();
                      })
                    }
                  >
                    Reconcile & sync saved progress
                  </button>
                )}
                {remoteDone && (
                  <p className="verified">
                    ✓ Exact final text verified in Google Docs
                  </p>
                )}
              </div>
            )}
            {snapshot.text && (
              <div className="actions">
                <button
                  onClick={() =>
                    download(snapshot.text, "typeflow-preview.txt")
                  }
                >
                  Export preview TXT
                </button>
                <button
                  onClick={() =>
                    download(
                      JSON.stringify(c.engine.getLog(), null, 2),
                      "typeflow-session.json",
                      "application/json",
                    )
                  }
                >
                  Export session log
                </button>
              </div>
            )}
          </section>
        )}
        <p className="hint">
          {mode === "blocks" || mode === "schedule" ? (
            "Scheduled and placement checkpoints can run with this panel closed while Chrome is awake. Use the job controls above to pause or cancel."
          ) : (
            <>
              Keep this panel open while writing. Closing it pauses new writing;
              Chrome may finish saved synchronization if enabled. Pause and Stop
              disable background writes. An in-flight request may still
              complete.
            </>
          )}
        </p>
        <p className="disclosure">
          TypeFlow automates text you supply. It does not establish human
          authorship. Google controls version history grouping and timing.
        </p>
        <details className="card">
          <summary>Privacy & local data</summary>
          <p>
            Drafts, settings, and recovery checkpoints are stored on this
            device. Google receives document content only when Google Docs is
            selected. Tokens are managed by Chrome.
          </p>
          <a
            href={`${TYPEFLOW_WEBSITE_URL}/privacy`}
            target="_blank"
            rel="noreferrer"
          >
            Privacy policy ↗
          </a>
          <p>
            Deleting local data removes recovery information. It does not delete
            documents from Google Drive or revoke access.
          </p>
          <button
            disabled={busy || active || synchronizing}
            onClick={() => setEraseConfirmation(true)}
          >
            Delete local data…
          </button>
          {eraseConfirmation && (
            <div className="error">
              <p>
                Export anything you want to keep and inspect any pending Google
                writes first. Remove all drafts, settings, and checkpoints from
                this device?
              </p>
              <button
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    await c.erase();
                    setDraft(emptyDraft);
                    setDocumentId("");
                    setEraseConfirmation(false);
                  })
                }
              >
                Delete all local data
              </button>
              <button onClick={() => setEraseConfirmation(false)}>
                Keep data
              </button>
            </div>
          )}
        </details>
        <footer>
          Less rush. More rhythm.{" "}
          <a
            href={`${TYPEFLOW_WEBSITE_URL}/support`}
            target="_blank"
            rel="noreferrer"
          >
            Support ↗
          </a>
        </footer>
      </main>
    </>
  );
}
const root = createRoot(document.getElementById("root")!);
void navigator.locks
  .request(OWNER_LOCK, { ifAvailable: true }, async (lock) => {
    if (!lock) {
      root.render(
        <main>
          <h1>TypeFlow is already open</h1>
          <p>
            Close the other TypeFlow panel or wait for background
            synchronization to finish, then reopen this panel.
          </p>
        </main>,
      );
      return;
    }
    const storage = await ExtensionStorage.open();
    const controller = new PanelController(storage);
    await chrome.action.setBadgeText({ text: "" });
    root.render(<Panel controller={controller} />);
    await new Promise<void>(() => {}); // Document destruction releases this Web Lock.
  })
  .catch(() =>
    root.render(
      <main role="alert">
        <h1>Unable to open TypeFlow</h1>
        <p>
          Device storage or execution locking is unavailable. Reopen the panel.
          Export any saved work before reinstalling.
        </p>
      </main>,
    ),
  );
