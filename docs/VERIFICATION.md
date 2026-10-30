# Verification record

Verified locally on October 30, 2026. No public deployment or external account writes were performed.

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
