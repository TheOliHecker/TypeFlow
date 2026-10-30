# TypeFlow

A free, private writing simulator: bring your own text, set the rhythm, and watch it appear progressively. Built with Next.js App Router, TypeScript, Tailwind CSS, and Lucide. All current features run in the browser, with no database, account, paid APIs, or runtime credentials.

**TypeFlow simulates writing activity. It does not generate text or establish original human authorship.** Event logs explicitly identify automated sessions and record actual observed browser timestamps.

## Run locally

Install [Node.js 24 LTS](https://nodejs.org/) (Node 22 or later is supported) and pnpm 11.25.0. A standard Node installation includes npm, which can install pnpm:

```sh
npm install --global pnpm@11.25.0
pnpm install
pnpm dev
```

Open **http://127.0.0.1:3000**. The homepage is `/`; the writing dashboard is `/workspace`. No `.env` file is needed. Keep the terminal running while you use the local website. Stop it with Ctrl+C.

For this Codex desktop environment, Node is bundled rather than installed on the normal shell PATH. The already-installed project can also run using:

```sh
export PATH="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
"$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm" dev
```

For production locally:

```sh
pnpm build
pnpm start
```

## Features

- Responsive editorial homepage, interactive typing demo, feature/how-to sections, native accessible FAQ disclosures, and light/dark themes.
- Titled draft editor, example text, clear control, word/character counts, and a 100,000-character limit.
- Single-text and optional two-text workflows with independent stage settings, 20–300 base WPM and Slow/Normal/Fast/Very Fast/Accelerated/Custom presets.
- QWERTY-aware nearby substitutions, missing/repeated/transposed/additional letters common spelling slips, capitalization errors and optional punctuation mistakes. Relative category weights, custom frequency and immediate/word/sentence/proofreading corrections with backspacing or selection deletion.
- Collapsed advanced settings for pause ranges, longer breaks, variation percentage, reproducible seed and feasible custom stage duration.
- Smart passage-aware revisions, minimal edits, paragraph rewrites or explicit full rewrite; review removed/inserted text before running. Type 1 finishes before Type 2 changes begin.
- Optional local rule-based proofreading for spelling, grammar, punctuation and style. Every wording change requires an explicit approval; suggestions are invalidated when their source text changes. The rule set is intentionally limited, with a provider interface for future assistance.
- Automatic duration estimates and custom durations with validation against feasible 20–300 WPM pacing. Custom duration adjusts edit timing while retaining configured thinking pauses; it can override the base WPM setting. It is a target, not a browser timing guarantee.
- Start, pause, resume, stop, reset, progress, elapsed/remaining time, current pace, correction highlighting, and automatically scrolling preview.
- Completed-session replay at 0.5×, 1×, 2×, 4×, or 8×, replay pause/resume/reset, paginated event inspection, and automated-session JSON exports.
- Completed TXT and DOCX downloads with paragraph breaks, plus clipboard copy. DOCX includes an automation disclosure in document metadata; TXT preserves the supplied text exactly without adding a footer.
- Local draft/settings/theme persistence, versioned session checkpoints, and paused recovery after interruption. Inspect or discard saved progress in the workspace; storage errors are visible.
- Cross-tab execution ownership, emergency stop/cancel, and live WPM/pause/word-safe typo adjustments with independent Type 1/Type 2 settings.
- Future Google Docs integration contracts and architecture, without OAuth or external writes.

## Quality checks

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check
```

Tests exercise exact text/Unicode/paragraph preservation, empty and long inputs, pause/resume, stop/restart, duplicate-session prevention, correction accuracy, deterministic event reconstruction, delayed callbacks, timer cleanup, duration feasibility, replay speed/pause/reset, and validation. Browser QA covers the primary workflow and responsive/theme presentation. The lockfile pins the complete dependency graph.

## Architecture

```text
src/app/                    App Router routes, metadata, design system
src/components/             Landing demo, draft workspace, settings, results
src/lib/types.ts             Shared settings, limits, text/time helpers
src/lib/use-draft.ts         Validated, debounced browser persistence
src/lib/simulation/session.ts Versioned checkpoints and browser storage
src/lib/simulation/adapters.ts Capabilities, receipts and external reconciliation
src/lib/simulation/scheduler.ts Foreground wakes and future host ports
src/lib/simulation/plan.ts   Seeded, deterministic simulation schedule
src/lib/simulation/index.ts  Portable core exports (no React or DOM)
src/lib/simulation/settings.ts Settings defaults, merging and validation
src/lib/simulation/rhythm.ts Configurable boundary pause scheduling
src/lib/simulation/revisions.ts Paragraph/sentence alignment and smart revision planning
src/lib/simulation/operations.ts Checked UTF-16 operations and output adapter interface
src/lib/simulation/diff.ts   Bounded token diff with grapheme-safe edit boundaries
src/lib/simulation/typos.ts  Weighted QWERTY slip generation
src/lib/simulation/proofreading.ts  Approval-based local suggestions/provider contract
src/lib/simulation/engine.ts Framework-independent elapsed-time engine
src/lib/simulation/replay.ts Recorded-event playback clock
src/lib/export.ts           TXT, lazy-loaded DOCX, and JSON downloads
src/lib/integrations/       Future Google Docs contracts only
```

The engine uses absolute wake deadlines and pause-adjusted active elapsed time. It compares each callback with active elapsed time rather than counting timer invocations. Pausing freezes active time. One timer per engine prevents overlap; UI snapshots are limited to approximately 25 per second. Delayed callbacks process at most 1,000 events each, giving the browser time to respond between batches. Typing and backspacing use grapheme boundaries, with explicit UTF-16 edit positions for integration compatibility. The portable engine preserves the supplied final text exactly, including line endings, unless a proofreading suggestion was explicitly approved. The website normalizes pasted Windows line endings in its editor.

New sessions use schema version 3 (adding checked replacement/verification events and speed metrics); legacy positionless events still replay. `index` and `deleteCount` are UTF-16 offsets in the document immediately before an event. `source` is the approved final output; `initialSource` and `options` retain the supplied drafts/settings. Events identify draft, revision and proofreading stages, and distinguish temporary `correction` events from approved wording edits. The event log has a versioned schema and records actual wall-clock timestamps, actual wall elapsed offsets (including user pauses), active elapsed time, and planned deadlines. Replay uses the recorded wall elapsed offsets, so it also reproduces delays and pauses. It never reruns the random simulation plan. A seeded planner makes the duration estimate and the execution schedule agree.

`useSyncExternalStore` consumes engine snapshots. Unmount, reset, stop, and pause cancel timers. The DOCX library loads only when requested. Completed logs stay in memory; LocalStorage stores only the draft, settings, theme, and basic session summary. Browser storage can be unavailable or cleared; download anything you need to keep.

## Deploy to Vercel

Deployment has **not** been performed. When you are ready to approve public deployment:

1. Create a GitHub repository and push the reviewed `codex/build-typeflow` branch. This workspace contains five staged feature commits plus any final polish commits; no remote is required for local use.
2. In Vercel, choose **Add New → Project** and import that repository/branch.
3. Keep the **Next.js** framework preset and the repository root as the project root. Use Node.js 24, `pnpm install --frozen-lockfile` as the install command, and `pnpm build` as the build command. Let Vercel manage the output directory.
4. No environment variables, OAuth credentials, or database configuration are needed.
5. Review access/visibility and Vercel's current hosting terms before deploying. Test the deployed URL on desktop and mobile.

See [Vercel's Next.js documentation](https://vercel.com/docs/frameworks/full-stack/nextjs). The project is a standard Next.js application, with no provider-specific runtime dependency. A deployment creates a new browser origin, so existing localhost drafts do not transfer automatically.

## Planned Google Docs integration

See [docs/GOOGLE_DOCS.md](docs/GOOGLE_DOCS.md) for authorization, scope choices, document creation, batched real-time edits, quotas, true request timestamps, revision reconciliation, retries, and disconnections. The current UI does not advertise an active Google connection. No OAuth implementation is included by design.

## Limits and behavior

- Plain text only: paragraph breaks and spacing are preserved; pasted rich-text styles, images, Markdown rendering, and original document styles are not supported.
- Documents are limited to 100,000 UTF-16 characters (matching textarea length semantics). Source emoji/Unicode are preserved; complete grapheme clusters are typed and deleted together.
- WPM uses the conventional five characters per word. Natural variation can momentarily be faster/slower than the selected base pace. Thinking pauses add time. The word counter counts whitespace-separated groups; it is not a language-aware tokenizer.
- Browser throttling, device sleep, or a busy main thread can delay completion beyond the estimate or target. Overdue events catch up in bounded batches and retain actual execution timestamps.
- Incomplete sessions can restore confirmed progress and actual audit timestamps from checkpoints. Completed logs/replay remain in memory; export JSON for permanent records. Recovery is limited by browser storage (3 MB serialized checkpoints); failures are visible. Importing arbitrary old logs remains unsupported.
- Stop retains the partial preview; downloads and replay are available for completed sessions. Reset clears the session and preserves the draft/settings.
- No cross-device sync, authentication, backend, or Google Docs connection exists in this version. LocalStorage is not encrypted. Avoid storing private text on a shared device.
- Theme follows the device preference on first visit, then remembers the explicitly selected theme.

## Simulation 2.0 notes

Type 2 custom duration targets the actual revision work, rather than retyping the entire final draft. An identical Type 2 produces no edits. An explicitly empty Type 2 removes the initial text; omitting Type 2 retains the initial draft. Typo correction passes finish before the next draft stage; proofreading-timed slips within a revision insertion are restored before the next edit, keeping later edit positions stable. Unchanged text is retained by targeted edits. The bounded diff is deterministic but does not promise a globally minimal edit script for large rearrangements.

Proofreading uses a small, conservative rule set, not a complete grammar checker. Google Docs synchronization remains a future integration; no external services or credentials were added. Nothing is deployed by this change.

## Recommended next steps

Get feedback on the writing workflow and custom-duration behavior, add cross-browser end-to-end tests to CI, then implement the Google Docs adapter against disposable test documents after choosing secure OAuth/token storage. Keep remote editing and local simulation progress separate.

## Core Engine 3.0

Import reusable types and modules from `src/lib/simulation/index.ts`. The core has no React, DOM or Google API imports. Its injected `Clock` supports preview, extension and worker hosts. `OutputAdapter` exposes `readText()` and `apply(EditingOperation)`; `eventOperation()` translates scheduled events into adapter operations. Future adapters must serialize operations against the current document and reconcile external edits before continuing. Core offsets are zero-based UTF-16 positions; a Google adapter must translate its document/tab structural offsets separately.

Smart revisions align paragraphs and sentences with bounded exact-anchor searches, retaining unchanged content before falling back to grapheme-safe word differences. Small spelling corrections affect the smallest span. Substantial sentence or paragraph rewrites default to progressively inserting the replacement after the original, then deleting the checked original range. Type 2 Advanced Settings also offer delete-first and atomic selection replacement. Minimal edits retain fine-grained diffs; paragraph rewrite replaces changed paragraphs; full rewrite remains an explicit option. Reordered passages are expressed through checked insert/delete operations, rather than a remote move command. Every completed plan verifies exact equality with the approved target; stale deletion/replacement ranges raise an error.

Type 1 and Type 2 retain independent settings, including 20–300 base WPM, pause ranges, weighted mistakes and correction timing. Speeds above typical presets are labeled accelerated automation. Base WPM uses five grapheme characters per word; effective Type 1 WPM includes its pauses and corrections. Overall recorded duration includes revisions and user pauses. Defaults are simulation choices, not scientifically universal typing probabilities. Selection replacement is atomic; insertion-based rewrites render progressively.

Limitations: sentence segmentation uses the runtime's English `Intl.Segmenter`; alignment is heuristic with 64-unit lookahead and does not guarantee the globally smallest edit script. Source Unicode is preserved, while keyboard-generated mistakes currently target Latin ASCII words. Plans and logs execute in memory, bounded by the 100,000-character input limits; unfinished sessions also have size-limited local checkpoints. Streaming cloud execution is not implemented. Existing schema 1/2 replay remains supported. No OAuth, extension, network adapter, deployment or new dependency is included.

## Phase 2 Part 2B

See [Editing execution and local recovery](docs/SESSIONS.md) for lifecycle, checkpoint format, scheduler ports, adapter capabilities, uncertain-write reconciliation, UTF-16 positions and future extension/Google Docs integration. Foreground scheduling and local checkpoint recovery are implemented. Extension/cloud execution and Google Docs synchronization remain contracts only.

Google Docs output is available as a development integration. Follow [Google Cloud and OAuth setup](docs/google-docs-setup.md) and configure `.env.local` from `.env.example`. Live Google testing requires your explicit initiation; mocked checks do not verify credentials or version-history grouping.
