# Verification record

Verified locally on October 30, 2026. No public deployment or external account writes were performed.

## Automated checks

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
