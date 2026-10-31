# Editing execution and local recovery

The Chrome production host now lives in `extension/src/`, using the same engine, Google adapter, journal, and validated checkpoints with a single-owner Web Lock and a durable Chrome storage barrier. Alarms drain saved synchronization without running new writing. See [launch instructions](LAUNCH.md). The web lifecycle described below remains the local preview host.

All writing is automated. Planned deadlines, actual execution timestamps, and confirmed synchronization times are distinct; recovery never invents historical edits.

## Lifecycle and ownership

`SimulationEngine` remains the portable Engine 3.0 planner/executor for the local preview. `useSimulation` owns browser persistence and a Web Lock (`typeflow-local-executor`), held while running or paused. A second workspace tab cannot start, resume, or discard checkpoints while that lock is held. The browser releases the lock after a crash/close; unsupported browsers report an error instead of silently running competing executors. Non-UI hosts must provide their own exclusive session ownership before executing.

Start creates a new session. Pause freezes active simulation time and saves progress. Resume continues the same plan. Stop/emergency stop immediately cancel the next local wake, preserve the partial document, and save a stopped checkpoint; Stop does not execute an extra catch-up batch. Cancel/Reset discard this session and checkpoint, retaining the input draft. Completed checkpoints are deleted after the final confirmed save. Completed results/replay remain available in memory and through existing exports.

The workspace lists recoverable sessions with stage, saved time, status, percentage, and an inspectable document. Resume saved session validates and restores its confirmed preview, original audit timestamps, operation index, approved target and independent settings, **paused**. Press Resume to execute. Closed-device time is shown as interruption time, not simulated writing. There is no automatic execution on page load.

## Versioned checkpoints and storage

`SessionCheckpoint` schema 1 contains the ID/document reference, mode, stage, full portable plan, current index, last confirmed operation ID, confirmed snapshot, settings/options, compact actual-time audit entries, simulation start, last activity, checkpoint time, next absolute deadline, accumulated active time, pause/recovery and synchronization/error states. `plan.source` is the approved target; pending operations are `plan.events.slice(operationIndex)`, avoiding a second pending queue. Audit entries reference plan indexes rather than duplicating editing payloads. No credentials are stored.

Checkpoints are written on Start, Pause, Resume, Stop, settings changes, completion, page hide and at most every five seconds during execution. A hard crash may lose the most recent five seconds of local preview; recovery rolls back to its atomically saved preview and index together. Preview operations are synchronous, so no separate per-character write-ahead record is needed. External documents must use the adapter journal protocol below instead.

`SessionStorage` supports sync or async implementations; `BrowserSessionStorage` implements the browser backend with atomic per-session LocalStorage values. Browser checkpoint callbacks are synchronous; extension/server hosts must await their own async storage before external execution. `ChromeStoragePort` defines the future storage bridge without loading Chrome APIs. A different database backend can implement the same session storage contract.

Loading validates schema, settings, schedule, ranges, replayed snapshot, final target and audit references. Incompatible/corrupt entries are skipped with an attention message; valid sessions remain recoverable. Users can explicitly discard saved checkpoints. Future schema versions must add an explicit migration before this version gate accepts them. There is a conservative 3 MB UTF-16 serialized checkpoint limit; large plans or exhausted quotas produce a visible **not safely recoverable** error. A simulation can still run and export results, but storage failure is never presented as successful recovery. Use IndexedDB/chunked storage in a future implementation for larger checkpoints.

## Scheduling and live settings

`Scheduler` defines foreground/extension/server environments and absolute UTC wake deadlines. `ForegroundScheduler` uses one cancellable timeout at a time; the engine delegates its default clock/wake mechanism to it. Injected `Clock` remains supported for existing hosts/tests. Deadlines determine eligibility; callbacks do not increment a tick counter. Delayed preview callbacks process at most 1,000 operations, validating each against the current confirmed local document. `eligibleOperations` supplies a bounded deadline-selection helper to future hosts.

Live WPM (20–300) and pause intensity retime only unexecuted operations. Enabling pauses on a plan originally made without pauses adds boundary delays. Type 1/Type 2 settings remain independent. Changing typo frequency regenerates only untouched, self-contained words of at most 256 UTF-16 units, with new stable operation IDs, using the existing typo engine. This is one pass over the future plan, not a new full-document diff. Already-started words, sentence/proofreading-deferred slips, atomic replacement passages and larger tokens retain their existing corrections. Advanced settings stay locked during execution. Live pace supersedes a previously requested custom duration.

## Adapter contract and uncertain writes

`DocumentAdapter` extends the existing `OutputAdapter`, adding initialization, state reads, capabilities, acknowledged execution, verification, cancellation and optional batch application. `PreviewAdapter` implements checked text, cursor/selection state and revision tokens. Unsupported operations fail explicitly; verification can safely fall back to a document read. Pauses/stage markers are scheduling metadata. Executor pause/resume/stop control execution rather than pretending they are document edits.

`AdapterExecutor` is the reusable **external-write** bridge, separate from the local simulation executor. Its host must exclusively own the session/document and process plan operations in order with stable IDs. Initial preview IDs combine session ID with event ID; regenerated future words get new IDs. Confirmed IDs never change.

`OperationJournal` must load/save durable records. Before submitting a write, the executor saves the operation ID, before state/revision, expected after text, planned deadline and in-flight state. It confirms only a matching adapter receipt. Timeout, lost receipt or a failed confirmation save leaves `requires-reconciliation`; no new writes are allowed. A restarted executor reloads the record before considering another submission for that ID.

Reconciliation reads the document: matching after-state confirms without replay; matching before-state permits retry only with enforced conditional revision tokens, because an older timed-out request might still commit. Any other content is a conflict requiring attention. Cursor/selection reconciliation needs observable position state. Unsupported reads require manual attention. An adapter claiming revision-token capability must **enforce** the supplied revision as a write precondition, not merely return a token. Full-text comparison is conservative and cannot establish causality when external edits produce identical content; universal exactly-once delivery is not promised.

Emergency stop aborts the executor signal and requests cancellation when supported. A remote request may already be committed or may complete later; its receipt/reconciliation must still be processed. Stop cannot revoke committed changes. The website currently has no remote writes, so its emergency stop has no remote request to cancel.

## Positions and future integrations

Every core index is a zero-based UTF-16 offset in the document immediately before that operation. Grapheme segmentation is used for typing, not as the coordinate system. Boundaries reject split surrogate pairs. Destructive/select operations validate exact expected range text; a mismatch stops the sequence. Insert-first revisions insert after the checked old passage before deleting it; later offsets describe the resulting current document. Repeated content is never resolved by a guessed global search.

Future Google Docs adapters implement `DocumentAdapter` over the existing integration contracts: translate core offsets to the selected Docs tab/body structural indexes, supply conditional revision controls and real acknowledgement timestamps, serialize quota-aware batches, and reconcile before resuming. OAuth/token storage is outside checkpoints and is **not implemented**.

`ExtensionWakePort` prepares `chrome.alarms` wake events; `ChromeStoragePort` prepares `chrome.storage.local`. A Manifest V3 worker must load the last confirmed checkpoint/write-ahead record, obtain execution ownership, compare actual document state, determine eligible deadlines, and process bounded ordered work. It must not blindly replay missed writes. Worker shutdown and imprecise alarms are normal. Sub-30-second timing requires an appropriate live context; alarms alone do not provide it. `ServerWakePort` prepares durable cloud jobs with equivalent reconciliation/ownership requirements.

Implemented today: foreground scheduling, local recovery, browser ownership, and reusable external execution/reconciliation logic. Extension alarms/storage implementations, browser-independent background execution, server persistence/workers and Google Docs synchronization remain future integrations. Hidden tabs may throttle timers; a closed tab, sleeping or powered-off device cannot execute local work. There are no keepalive hacks, extension, OAuth flow, paid services or deployment.
