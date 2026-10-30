# Private Developer Mode (Phase 2D)

The console at `/developer` is an internal foreground laboratory for **automated** writing. The public workspace and its writing preferences are unchanged. Access it through Workspace → Settings → Unlock Developer Mode.

## Enable local access

Developer Mode is deliberately unavailable in production builds, on Vercel, or on a public origin. There is no production bypass. The existing Google OAuth vault, administrator sessions, document registry, and login limits live in one server process; they are not durable or distributed authentication.

1. Use Node 22+ and install the existing dependencies (`pnpm install`).
2. Run `node scripts/developer-secrets.mjs` in an interactive terminal. Enter a strong password of at least 16 characters at the hidden prompt. Copy the generated scrypt hash and random signing secret into untracked `.env.local`. The script does not save the password.
3. Set these server-only variables in `.env.local`:

   ```dotenv
   TYPEFLOW_DEVELOPER_ENABLED=true
   TYPEFLOW_DEVELOPER_ORIGIN=https://localhost:3000
   TYPEFLOW_DEVELOPER_PASSWORD_HASH=<generated-scrypt-hash>
   TYPEFLOW_DEVELOPER_SESSION_SECRET=<generated-random-signing-secret>
   TYPEFLOW_DEVELOPER_GOOGLE_ALLOWLIST=<optional-comma-separated-admin-emails>
   ```

4. Start a loopback-only HTTPS development server:

   ```sh
   pnpm exec next dev --hostname localhost --experimental-https
   ```

   Trust the local development certificate using your normal local certificate workflow. Use exactly the configured HTTPS origin in the browser. Secure cookies are always required; there is no HTTP cookie fallback. Never expose this development server through a tunnel, reverse proxy, or public bind.

5. For live tests, follow [Google OAuth setup](google-docs-setup.md), use a Google OAuth web client that accepts your loopback HTTPS callback, and configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI=https://localhost:3000/api/google/callback`. Register that exact callback in Google Cloud. Do not weaken the admin cookie to accommodate an HTTP-only OAuth setup. Connect Google in the workspace, then unlock Settings.

The optional Google allowlist checks the email and `verified_email` from Google's server-side userinfo response. A client-provided email is never trusted. When configured, an active allowlisted verified Google session is required both at unlock and on every developer request. The developer password is **always** required.

The signing secret must contain at least 43 characters; generate it randomly using the setup script. The password encoding is `scrypt:<32 hex salt>:<128 hex digest>` with Node's default scrypt parameters and a 64-byte output. Hash comparison and cookie signatures use constant-time comparison. Login attempts have a global five-attempt budget per rolling 15 minutes, including successful attempts. Spoofable forwarded IPs are not used. Restarting the process resets this local protection and invalidates all sessions. Sessions expire after 30 minutes, do not slide, and can be explicitly locked. Cookies are signed, HttpOnly, Secure, SameSite=Strict and use the `__Host-` prefix. Mutations require the exact configured Origin, Host, JSON content type, and the custom request header. All developer API actions authorize on the server, and only test documents created in the current administrator session are accessible.

Production support requires durable Google token storage, verified administrator authentication, distributed throttling, and a separate security review. It is intentionally unsupported here.

## Run an interval experiment

Connect Google first. Choose any combination of 5, 10, 15, 30, 45, 60, 90, or 120 seconds; choose 2, 5 (default), or 10 minutes per phase; set 20–300 WPM. Scheduled total time is capped at 20 minutes and eight documents. A separate server wall-time cap of 25 minutes includes setup, pauses and API latency. Lower limits can be set in Developer Settings.

One-document mode appends all phases to one newly created Google Doc. Separate-document mode creates one per interval. Each phase has an explicit `[TypeFlow Automated Test …]` boundary; marker writes are tagged `boundary`, separately from `sync`. Generated document links appear as creation completes. Use synthetic non-sensitive samples or provide enough test text for the selected WPM/duration. Samples use unique numbered observations rather than repeating an identical sentence. WPM uses the engine's five-character word convention; displayed lexical word counts may differ.

The runner consumes Core Engine 3.0's deterministic operation plan in actual elapsed foreground time. This sync-isolation experiment disables typing mistakes and thinking pauses; use the debugger to inspect those settings separately. It uses the existing Google Docs adapter and AdapterExecutor journal, including revision-aware read/conditional-write/read checks. A successful HTTP response is an API acknowledgement, and final exact-text verification is a separate result. Reads are performed for reconciliation and validation; the dashboard never polls Google just to refresh metrics.

Pause blocks new writes. Resume first reconciles pending journal entries against actual document content, then retries only the exact previously prepared operation when safe. Stop and Emergency Stop immediately close the client dispatch gate and send a server stop command; they do not flush queued text. An already dispatched request can complete and is accounted for when its response arrives. Stopped tests cannot resume. Starting is guarded in the browser and by one active run per administrator server session. Two separate administrator sessions are independent and share the existing project quota budget.

Keep the experiment tab visible. Hiding it pauses execution; a scheduler gap over five seconds also pauses it without generating missed writes. Refresh restores a paused/interrupted tab checkpoint and requires explicit reconciliation. Real request timestamps and phase active time are recorded separately from intended schedule and total wall time. Network, OAuth and storage failures require attention; no success is invented. A server restart or expired administrator cookie loses document authorization, so existing tests cannot safely resume; inspect/export locally available metadata, unlock and start a new experiment. Unknown document-creation outcomes may leave an orphaned automated test Doc; inspect Drive manually rather than assuming creation failed. No background worker or Chrome extension is included.

Google quotas are operating constraints, not permanent guarantees. Existing `GOOGLE_WRITE_REQUESTS_PER_MINUTE` and `GOOGLE_PROJECT_WRITES_PER_MINUTE` apply to experiments and normal Google output together. Conservative defaults remain 30 and 300, below the user's referenced 60/600 write quotas. Check the limits for your actual Google project before changing them. The shared adapter retries only explicit 429 rejections, with a bounded backoff; ambiguous failures require reconciliation.

## Inspect results

- **API Monitor:** actual transport request IDs, run and phase, document IDs, start/end times, status, latency, retries, outcome and revision tokens when returned. Metadata retention is capped at 2,000 requests and 200 events per run. No credentials, payloads, or full document contents enter the event log. Failed transport responses do not prove the remote write failed.
- **Version History Inspector:** open the linked Doc and choose **File → Version history → See version history**, expand available groups, then record visible/expanded counts, grouping, timestamps and notes against the matching phase. Comparison metrics exclude boundary writes. Visible timestamps intended for export must be comma-separated ISO timestamps with an explicit timezone, such as `2026-10-30T12:00:00Z`. Freeform notes remain local to the active view/checkpoint and are excluded from saved reports/exports. Use Save report locally after recording numeric observations.
- **Typing Engine Debugger:** accelerated in-memory execution of the existing plan, including typo categories and weights, seed, corrections, pauses, stage events, final output, and Draft 1/2 revision classifications. It never constructs a Google transport. Only the first 2,000 operation details are displayed. Operation offsets are simulation times, not claimed Google API times.
- **Document Validator:** pause, then compare the current phase's authorized test Doc with generated text or a supplied approved final text. It supports the adapter's unambiguous plain-text structure, not tables, suggestions, nested tabs or embedded objects. Exact UTF-16 text, counts, paragraphs, changed spans, whitespace, punctuation and Unicode normalization are inspected. Missing/extra character counts describe a changed span and may include substitutions; duplication detection is heuristic. The readable diff stays in the page and never enters exported reports. Mismatches never trigger an overwrite. Validation currently targets the current phase; earlier separate documents can be inspected manually.
- **Local failure probes:** use a preview adapter with the same AdapterExecutor to exercise blocking and reconciliation for named network/auth/HTTP failures, timeout, interruption, uncertain writes and concurrent edits. These are deliberately local exceptions, not full-fidelity OAuth/network/HTTP retry emulation. They cannot overload Google or cause a real quota violation.

Google controls visible version grouping. The Drive API cannot be assumed to expose every expanded history entry. API requests, acknowledged writes, manual visible versions, requests per version, latency and error rate are empirical observations; no one-call/one-version relationship is guaranteed. Automated activity never demonstrates independent human authorship. No revision timestamps are fabricated or backdated.

## Reports and local privacy

Export the current test as JSON or a phase comparison CSV. JSON contains configuration, real timestamps, document IDs/links, bounded request metadata, verification counts and numeric/manual timestamp observations. CSV contains phase timing, interval, document ID, sync write counts, retries, latency, error rate, observed versions, requests/version and match result. JSON provides detailed errors/events and boundary request records. Neither export includes test text, diffs, operation payloads, passwords, tokens or freeform notes. Disabling diagnostic logging retains aggregate counters but omits detailed request/event records and therefore limits phase comparisons.

Save reports locally explicitly; up to ten reports / 500 KB are retained in LocalStorage and filtered by the selected retention on save (expired reports are also filtered on load). The recovery checkpoint uses at most two million characters in tab-scoped SessionStorage and necessarily contains test text plus before/after journal text. Browser storage is not encrypted: use only non-sensitive test content on a trusted browser profile. Storage errors block checkpointed writes and produce warnings; export before clearing. Developer Settings can clear history and the recovery checkpoint after stopping and waiting for in-flight work. Lock clears the active tab checkpoint; saved metadata reports remain until cleared. Google documents are never deleted automatically.

## Verification

Run `pnpm typecheck`, `pnpm lint`, focused `pnpm exec vitest run src/lib/developer/auth.test.ts src/lib/developer/lab.test.ts`, and `pnpm exec next build --webpack`. Focused tests use local mocked transports and fake clocks; none are live Google sessions. Production builds keep Developer Mode disabled by design. Real Google behavior requires your own OAuth configuration, authorization and an explicitly started experiment.
