# Verification record

## Production release branch — October 30, 2026

Based on `codex/google-docs-integration` through `4d35e7d`. No real Google authorization, external document writes, store submission, or website deployment was performed. The configured production ZIP remains blocked by publisher-owned OAuth/store values; the unconfigured review ZIP is deliberately labeled and has no OAuth client in its manifest.

| Check                                                        | Result                                                                                                                                   |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Next route type generation + TypeScript                      | Passed. Production build also checks TypeScript.                                                                                         |
| ESLint                                                       | Passed with no errors or warnings.                                                                                                       |
| Vitest                                                       | **82 tests passed in 13 files.**                                                                                                         |
| Production website build                                     | Passed with supported `next build --webpack` (`pnpm build`).                                                                             |
| Actual packaged extension + production website browser suite | **4 Playwright tests passed.** Chromium loads the actual unpacked MV3 package; Google authorization/API responses are mocked where used. |
| Review extension bundling/ZIP/checksum                       | Passed. `release/typeflow-1.0.0-review.zip`; SHA-256 verification passes.                                                                |
| Missing production configuration                             | Correctly rejected by the production packager; no fake OAuth ID or falsely configured production ZIP is emitted.                         |
| Formatting and Git whitespace                                | Checked before final release commit.                                                                                                     |
| GitHub Actions                                               | Workflow prepared; remote CI has not been run in this session.                                                                           |

### What the automated checks establish

- Existing engine, deterministic plans/revisions, exact Unicode and paragraph output, pause/resume/stop, replay, input validation, proofreading approvals, checkpoint validation, and Developer Mode authorization tests remain passing.
- Google range compilation covers all revision modes and rewrite methods. Conditional revisions, collaborator conflicts, final-text mismatch diagnostics, explicit quota backoff, authorization errors, uncertain-response reconciliation, and duplicate-write prevention are tested with mocked Google APIs.
- Extension storage tests verify durable barriers, queued write failures/retry, and newest-checkpoint preservation. Corrupt recovery data, false completion flags, and mismatched write-ahead records fail closed. Background worker tests verify saved-progress-only synchronization, exclusive ownership with the panel, and conflict handling. These tests do not establish real Chrome alarm delivery or Google API availability.
- Browser checks cover public install/help/privacy/support navigation; local web writing and deletion; production 404 isolation for Developer Mode and web OAuth; extension Single Text/Draft Evolution; pause, close/reopen, paused restore/resume; exact local output and TXT download; 320 px overflow; and rejection of unconfigured OAuth.
- The packaged Google browser workflow uses mocked Chrome authorization and Docs/Drive APIs. It confirms a lost acknowledgement is reconciled with one actual mocked write, nonempty-document starts are rejected, and collaborator content is preserved on conflict. This does not pass real OAuth/API acceptance.
- Store screenshots are actual local extension UI captures at 1280×800. The 128 px icon, 440×280 tile, and 1400×560 marquee were generated and visually inspected. No screenshot is presented as proof of a live Google connection.

### External acceptance still required

Complete every checkbox in [Google setup and real-account acceptance](google-docs-setup.md), including consent/cancellation, stable extension/OAuth identity, actual progressive and revision writes, account expiry/revocation, network interruption, background alarms/restart, collaborator conflicts, and final-text comparison in disposable Google documents. Verify the toolbar's native side-panel opening in the configured desktop Chrome installation. Complete Google/store review and test the deployed website/live store installation. Nothing here guarantees Google version-history timing or grouping.

### Build environment

Node.js 24, pnpm 11.25.0, Next.js 16.4.3, Playwright 1.64.1. This desktop sandbox blocks Turbopack's local CSS compiler socket, including an escalated retry. The release uses the supported webpack builder; it passed. Browser tests required local-server/Chromium process access. Build artifacts contain bundled local code and dependency license notices; they exclude server/developer code, environment files, private credentials, and source maps.

The records below describe earlier milestones, retained for context.

## Simulation Engine 2.0 verification

- TypeScript (`pnpm typecheck`) and ESLint (`pnpm lint`) pass with no warnings.
- Existing engine, replay and input tests pass; focused evolution tests cover all six typo categories, four correction timings, both correction methods, three diff modes, complete Unicode graphemes, independent revision preferences, custom durations with fixed pauses and explicit proofreading approvals.
- A clock-driven staged session verifies pause/resume during revision and exact reconstruction from the schema 2 event log.
- Production build passes with `pnpm exec next build --webpack`. Default Turbopack cannot bind its local CSS worker port in this environment, including on an escalated retry.
- Browser smoke check on the production server: two-text mode, independent 200 WPM speeds, visual changes, exact final draft, exact replay, approval-required spelling suggestion, proofreading output and completed export controls. Restored the original example draft/preferences afterward.
- `git diff --check` passes. No production deployment or external writes.

The records below describe the earlier baseline verification, not additional browser testing performed for this phase.

## Baseline automated checks

- `pnpm typecheck`: passed, including generated Next.js route types.
- `pnpm lint`: passed with no errors or warnings.
- `pnpm test`: **26 tests passed** across engine, replay, and input-validation suites.
- `pnpm build`: passed; `/` and `/workspace` prerender successfully.
- `pnpm format:check`: passed.
- `git diff --check`: passed.

The engine tests include exact Unicode/paragraph output, empty and maximum-length text, pause/resume, stop/restart, corrections, independent reconstruction from the event log, duplicate starts, timer drift/cleanup, deterministic plans, and feasible/custom duration validation. Replay tests verify recorded mistakes/backspaces, speed changes without playhead jumps, pause/resume, reset/restart, and timer cleanup.

## Browser checks

Used the local development server for the main interactive workflow, then repeated refresh recovery and layout checks against `pnpm start` after a successful production build.

- Landing-to-workspace navigation and example text.
- Editing, counts, clear, and disabled Start for empty text.
- 120 WPM selection, pause/typo intensity settings.
- Start → Pause → Resume → Complete, with locked input while active.
- Stop retains partial output; Reset restores the ready state.
- Impossible custom duration presents a specific feasible range and disables Start.
- Replay at 8×, replay pause/resume, and identical final text.
- Successful clipboard copy feedback.
- TXT, DOCX, and automated JSON downloads.
- Refresh during a running production session restores the draft, reports interruption, and does not restart a session automatically.
- Light/dark theme switching and presentation.
- Desktop 1280×900 and mobile 390×844 layouts; document width matched viewport width without horizontal page overflow.
- FAQ disclosure expands and closes using the keyboard; Google Docs answer accurately states the feature is planned.
- No browser error-level messages observed during the tested workflow.

## Independent export inspection

Downloaded a completed session with `Hello 🌿.\n\nA fresh start.` as its source:

1. Read the TXT and compared its content exactly with the source.
2. Opened the DOCX ZIP, extracted `word/document.xml`, reconstructed its paragraphs, and compared exactly, including the blank paragraph and Unicode. Confirmed the automated-simulation disclosure in `docProps/core.xml`.
3. Parsed the downloaded JSON, independently applied every insert/delete event, and compared the result exactly. Verified its automation label and monotonic elapsed offsets.

## Scope of verification

This is local verification in one browser environment, plus injected-clock automated tests. Other browser engines, assistive technologies, Vercel hosting, and live Google Docs calls were not tested. Google OAuth and remote editing are intentionally unimplemented. Full event logs are not persisted after refresh/navigation; this is disclosed in the UI and README.

## Phase 2 Part 2B — October 30, 2026

- Verified `c79c010` and continued on `codex/google-docs-integration` from a clean tree.
- TypeScript (`pnpm typecheck`) and ESLint (`pnpm lint`) passed.
- One production webpack build (`pnpm exec next build --webpack`) passed, including static generation for `/` and `/workspace`.
- Existing engine/revision tests passed alongside the first six recovery tests (29 tests). The final focused recovery file passed all eight tests after adding timeout/capability checks. No full-suite loops or extensive browser automation were run.
- Focused coverage: persisted revision recovery with exact audit timestamps and approved Unicode output; pause/resume and emergency-stop timer cancellation; lost acknowledgements and duplicate prevention across executor restarts; late remote completion after stop; future-only live settings; incompatible/corrupt checkpoints and storage failure; unsafe UTF-16 ranges; uncertain timeout retries without revision tokens; unsupported adapter operations.
- No OAuth, Chrome extension, external writes, deployment, paid service or main merge was performed. Browser scheduling remains subject to tab throttling, closure and device sleep. External adapters/journal storage and extension/server hosts require integration before remote/background execution is available.
