# Premium product upgrade — review report

Base: production release `e670455`, branch `codex/production-launch`. Work is isolated on `codex/premium-product-upgrade`. Production PR #2 was not edited, merged or overwritten. No publishing, deployment or purchases occurred.

## Implemented

- Major revisions now remove the old range before progressively inserting the new passage, or use a native range replacement. Saved insert-first preferences migrate to safe delete-first behavior at plan time. The position-aware planner and durable engine remain intact.
- Shared inline revision comparison shows unchanged passages, deletions, additions, and paired replacements. Major groups can be approved individually; website and extension starts require approval of major groups. Exact target verification remains part of execution.
- Final document words, inserted and removed operation-stream words, completed operations, and stage completion are separate. Operation counts include verifications; inserted/removed words count edit-text streams including corrections, not final content length. Cached incremental counting avoids cloning the growing log every frame.
- Multi-Block: named editable blocks, removal and reordering, document position guide, fresh-baseline validation, exact-result preview, approval, descending-index insertion, same-position ordering, Google verification, and durable uncertain-write reconciliation. Body-text-only boundary is explicit.
- Scheduled Writing: multiple named windows, per-stage pace and pauses, baseline-to-draft and draft-to-draft transformations, preview/approval, local persistence, alarm-driven checkpoints, missed status, startup interruption, pause, cancel, explicit rescheduling, and status/attention badges.
- Shared Obsidian Blue tokens; accessible light palette; neutral panels; larger readable document text; keyboard focus indicators; compact extension mode navigation; collapsed advanced settings; reduced-motion support; restrained transitions.
- Homepage now leads with the extension, its supported workflows, an actual running local demo, installation, privacy, safety and limitations. Installation separates review builds from future store distribution.
- Homepage demo no longer writes recoverable sessions or uses workspace locks. Website recovery shows at most one saved session instead of a card stack. Concurrent same-tab lock acquisition is guarded; locks remain protected for actual interrupted Google work.
- Existing OAuth, security gates, Developer Mode isolation, MV3 architecture, Core Engine 3.0, checkpoint sync, durable operation execution and pipelines are retained.

## Scope boundaries

- Scheduled execution uses verified passage checkpoints, not background character-by-character keystrokes. This is a reliable reduced scope for free MV3 execution. Finish times are estimates.
- No tables/cells, drawings/text boxes, Slides, PDFs, nested document tabs, worksheet detection or visual-selection mapping. Tables are technically possible via a future structural adapter, not supported by the current adapter. No unsupported location reports success.
- Existing normal-body styled runs can be read; unchanged runs are not rewritten. Insertions inherit Google's formatting; arbitrary rich-text reproduction is unverified.
- One active scheduled/placement job extension-wide. Rescheduling remaining work coalesces it into one explicitly selected recovery window.
- No OS-level notifications or global keyboard emergency shortcut added. The panel provides stop controls and local status; toolbar badges signal attention/completion.
- No paid workers, external analytics, generated writing, broader Google permissions, new public brand or claims about human authorship.

See [Scheduling and Placement](SCHEDULING_AND_PLACEMENT.md) and [Brand Readiness](BRAND_READINESS.md).

## Competitive evidence

Reviewed October 31, 2026. Vendor descriptions establish advertised capabilities, not independently tested performance.

| Source                                                                                                                  | Documented capabilities                                                            | TypeFlow comparison                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| [Duey 3.0](https://www.duey.ai/post/duey-auto-typer-3-0-multi-block-typing-emergency-stop-adaptive-corrections)         | Multi-block placement by clicking; emergency shortcut; adaptive corrections        | Independent API-index placement and verified checkpoints; no click placement/global shortcut claim.                   |
| [AutoTyper.ai](https://www.autotyper.ai/)                                                                               | Multi-block queues for document placement                                          | Named blocks with user-confirmed body offsets and before/after validation. No universal compatibility claim.          |
| [Write It listing](https://chromewebstore.google.com/detail/write-it-auto-typer-for-g/agbpbjhbeamdedbialaafmhnjaajacfk) | Configurable automatic typing, pauses, corrections and broader editor integrations | Existing Core Engine pacing retained; deliberately narrower Docs integration. No broader-editor or superiority claim. |

Design references reviewed: [Linear](https://linear.app/homepage), [Raycast](https://www.raycast.com/), [Stripe](https://stripe.com/), [Notion](https://www.notion.com/), [Framer](https://www.framer.com/), [Descript](https://www.descript.com/). Interpretation: lead with one concrete task, clear hierarchy, a product-led preview, progressive controls and restrained motion. No code, branding or distinctive assets copied.

## Before / after

| Existing release                                         | Redesigned workspace                                                            |
| -------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Warm light surfaces, serif emphasis, small labels        | Neutral Obsidian Blue surfaces, professional sans-serif, readable document text |
| Homepage demo created recovery checkpoints               | Demo isolated from persistent workspace sessions                                |
| Stack of interrupted-session cards                       | At most one recovery prompt                                                     |
| Insert-first major revisions briefly duplicated passages | Delete-first or atomic replacement at original positions                        |
| Words written divided by final length                    | Final content and operation volumes are separated                               |

Actual captures: [before workspace](screenshots/workspace-before.png), [after workspace](screenshots/workspace-after.png), [homepage](screenshots/home-after.png), [installation](screenshots/install-after.png), [placement](screenshots/extension-placement.png), [schedule](screenshots/extension-schedule.png). Extension placement/schedule captures use deterministic mocked Google document reads; they are UI evidence, not evidence of live Google writing.

## External configuration and launch gate

The review ZIP deliberately disables unconfigured OAuth. Production packaging still requires `TYPEFLOW_EXTENSION_CLIENT_ID`, the stable `TYPEFLOW_EXTENSION_PUBLIC_KEY`, and `TYPEFLOW_WEBSITE_URL`. Match the extension ID to the registered Chrome OAuth client; configure the Google consent screen and authorized test accounts. Store publication remains a separate approved action. Real user authorization and disposable Google Docs are not available in this session.

Workflows A–F have automated engine/adapter/UI coverage to differing depths; **none is certified end-to-end against real Google** here. Live OAuth, disposable-document writing/revisions/placement, multi-window completion, browser restarts, actual device sleep/wake, token expiry and real quota rejection remain launch acceptance requirements. Real table-cell insertion is unsupported, so that workflow cannot pass this release.

Recommended GitHub action: review these commits on the separate improvement branch, then push it and open a new draft PR targeting `codex/production-launch`. Preserve PR #2. Do not merge or publish until live acceptance and owner review pass.

## Validation results

Final local validation (October 31, 2026):

| Check                                                                    | Result                                                          |
| ------------------------------------------------------------------------ | --------------------------------------------------------------- |
| TypeScript (`next typegen`, `tsc --noEmit`)                              | Passed                                                          |
| ESLint                                                                   | Passed                                                          |
| Prettier repository check and Git whitespace check                       | Passed                                                          |
| Vitest                                                                   | 99 passed across 17 files                                       |
| Playwright against production build and actual loaded MV3 review package | 7 passed                                                        |
| Next.js production build (Webpack)                                       | Passed                                                          |
| Extension review packaging                                               | Passed; `release/typeflow-1.0.0-review.zip` and SHA-256 sidecar |

The installed executable entrypoints were run directly with the bundled Node runtime on PATH because the host `pnpm` wrapper attempted a registry/dependency-state refresh. No dependency versions or paid services were added.

| Workflow                   | Evidence here                                                                                                                                   | Still external                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| A — Basic writing          | Packaged local writing; mocked OAuth/API conditional writes and exact readback                                                                  | Real OAuth and Google document                                                    |
| B — Draft Evolution        | Long informal rewrite regression; unchanged/Unicode/paragraph tests; website and extension local browser completion and approval                | Real Google formatting/version behavior                                           |
| C — Multi-Block            | Ordering/baseline tests; mock adapter verified writes; packaged placement previews at 320px                                                     | Real worksheet body placement; tables unsupported                                 |
| D — Scheduled window       | Planner validation, alarm wake decisions, missed/auth/conflict cases; saved job UI, pause/cancel and persistence                                | Long-running real Chrome alarms and Google completion                             |
| E — Separate draft windows | Mock runner executes both windows, preserves the intervening draft, revises in place and verifies final content                                 | Real separated windows in Google                                                  |
| F — Recovery               | Lost-ack reconciliation without duplicate writes; simulated worker/browser restart and missed/sleep wake; packaged legacy interruption recovery | Actual device sleep, browser shutdown during remote write and expired credentials |

Actual before/after screenshots and fixture-based extension screenshots are included in `docs/screenshots/`. The installation preview uses an actual local review-build capture, not a drawn or invented interface. These captures do not certify live Google workflows.
