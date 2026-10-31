# Scheduled Writing and Multi-Block

This release uses no paid APIs or cloud workers. All definitions, source text, and write-ahead journals are in trusted extension-local Chrome storage. The existing Google `drive.file` scope is unchanged.

## Placement

1. Connect Google and select a document already authorized for TypeFlow.
2. Choose Multi-Block and read the selected document. Expand the position guide.
3. Name each answer, enter its text, and select an insertion offset. Offsets are **zero-based UTF-16 units in the body text**, not visual cursor coordinates. The guide labels paragraph starts; an offset at the end of a question can be used to insert a newline and its answer.
4. Add, rename, edit, remove or move blocks up. Confirm the exact final-document preview, then approve and start.
5. Writes execute from the largest offset downward so earlier positions remain stable. Tied offsets preserve list order in the final document. Each checkpoint is verified by reading Google. Surrounding text is compared, never searched and replaced heuristically.

Incorrect placement before execution: change the offset and preview again. After execution begins: stop, inspect the actual document, make any desired correction in Docs, and create a fresh plan from a fresh read. Cancellation does not undo already confirmed content. Arbitrary automatic rollback could remove a collaborator's work and is deliberately absent.

Only the adapter's existing contiguous, single-tab body paragraphs are supported. Lists, tables, drawings, embedded objects, nested tabs and suggested edits are rejected before writing. Styled text runs in supported paragraphs retain untouched content; replacement text inherits Google's insertion formatting. Explicit rich-text reproduction and full formatting fidelity are not promised.

Google's [tables guide](https://developers.google.com/workspace/docs/api/how-tos/tables) documents cell insertion, but tables introduce structural index gaps. The current plain-text adapter cannot safely flatten those gaps. Cell insertion remains unsupported pending a structural adapter and live acceptance tests. Google's REST adapter also cannot acknowledge a visible editor selection. TypeFlow does not infer indexes from the canvas or claim arbitrary text-box targeting.

## Scheduling

Write starts immediately with Core Engine pacing. Schedule uses a separate conservative passage-checkpoint runner suited to Manifest V3 worker suspension, not millisecond keystroke timers.

1. Read the selected document to establish the baseline.
2. Set each stage's name, approved resulting document, start, finish, WPM and pause preference. Add up to twelve non-overlapping stages.
3. Review the timeline, revision groups, and exact final text. Approve and save.
4. Keep an awake computer running Chrome. The schedule is independent of panel visibility.
5. Inspect current stage, next event, timezone, status and Google-confirmed checkpoint count in Schedule.

The first stage transforms the baseline into Draft 1. Later stages transform the **existing preceding draft** in place. The draft remains intact in the break. Each changed passage is an atomic range replacement in a conditional Google batch. There is no second full-draft append.

Checkpoint spacing respects base pace, per-stage pause settings and a minimum 30-second interval. Too-short windows are rejected. Chrome alarms wake the worker every 30 seconds; at most one due operation runs per wake. This is deliberate quota-conscious coarse pacing. It does not provide character-level scheduled typing, stochastic pauses, typo playback or exact finish guarantees. Use Write for the foreground character-level experience.

Times are saved as absolute Unix instants, with the originating IANA timezone displayed. Existing jobs do not move when the OS timezone changes. Nonexistent and repeated DST local times are rejected by the form; choose an unambiguous time. Stage boundaries remain absolute through DST.

[Chrome alarms documentation](https://developer.chrome.com/docs/extensions/reference/api/alarms) explains delayed alarms and sleep behavior. TypeFlow recreates alarms on worker initialization, install and browser startup for Chrome 120 compatibility. A browser startup interrupts running work. A checkpoint more than 90 seconds late or beyond its stage deadline is marked missed. Normal worker suspension between future checkpoints is supported. There is no catch-up loop.

## Recovery, stop and privacy

Pause prevents future checkpoints. Emergency stop/cancel retains confirmed document content and prevents future scheduled operations. An already submitted Google request may complete before the serialized control acquires ownership; this cannot retract a committed remote write.

An auth, quota, conflict or uncertain write stops automation and sets a generic local message and toolbar attention badge. Reconnect Google if necessary, inspect the document, and choose a future recovery window. Recovery reconciles the durable before/after journal before retrying an uncertain operation. Identical confirmed operation IDs are not replayed. A conflicting document requires manual resolution rather than forced overwrite.

Recovery currently coalesces remaining checkpoints into an explicitly selected window; it does not preserve original stage breaks. Cancel and create a new multi-stage plan if those breaks must be retained. Only one automation job may be active extension-wide. Legacy foreground writing and scheduled writing refuse to compete. Desktop notifications are represented by local status and toolbar badges; no new notifications permission was requested.

Deleting extension-local data cancels the scheduled job and removes local schedules/journals as well as legacy drafts. It does not delete Google files or revoke OAuth access. Export writing and inspect uncertain external writes first.

Automated writing and revision playback are not proof of original human authorship.
