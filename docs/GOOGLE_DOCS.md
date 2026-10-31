# Google Docs integration design (historical)

The original design below is retained for architectural context. **The current implementation is the MV3 extension**, with Chrome-managed OAuth, per-file document access, durable checkpoint synchronization and reconciliation. See [current setup and real-account acceptance](google-docs-setup.md) and [launch instructions](LAUNCH.md). Statements about unimplemented features below describe the earlier prototype, not the current release branch.

## Authorization and document creation

Use a server-backed Google OAuth authorization-code flow with PKCE, random state, validated redirects, explicit consent, and secure HttpOnly/SameSite cookies. Request the narrowest workable scope, preferably `drive.file` for documents created by or explicitly opened with this application. Confirm requirements against [Google's scope guide](https://developers.google.com/workspace/docs/api/auth) before implementation. Keep client secrets and refresh tokens on the server, encrypted at rest; never put them in browser LocalStorage, exported logs, public environment variables, or the Git repository. The initially database-free app will need a deliberate secure session/token storage design before this feature ships.

After authorization, ask the user to create a document for a clearly labeled automated session. [`documents.create`](https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/create) creates a blank document from a title. Supply content separately using `documents.batchUpdate` and `insertText` requests. Use an explicit automated-session title/notice. Read the document and its current tab/revision before writes. Docs text positions use UTF-16 indices and a document-body starting index, not TypeFlow's zero-based source offset.

## Real-time writing and quotas

An authorized session coordinator consumes current simulation actions and serializes remote writes. Do not call Google for every simulated character. Combine contiguous edits into small, ordered batches under a configurable per-user/project rate limiter. Honor the current project quotas, `Retry-After`, and bounded exponential backoff with jitter. Do not hard-code a claim that remote edits can keep pace at 200 WPM. If API/network latency prevents the requested timing, communicate the delay and pause or slow the remote session.

Track remote progress separately from the local preview. A local simulation event does not establish that an API edit succeeded. Remote text may be chunked and should be identified as automated. See [batch requests](https://developers.google.com/workspace/docs/api/how-tos/batch) and [usage limits](https://developers.google.com/workspace/docs/api/limits).

## Revisions, retries, and disconnections

For each logical operation, record an application operation ID, session ID, target tab, desired UTF-16 range, and expected revision. Apply batches with write control against a known revision. Do not assume application operation IDs make the Google API idempotent. An uncertain timeout may follow a successful write: read and reconcile document content/revision before retrying, or the text may be duplicated. Stop and ask the user to resolve unexpected concurrent editing rather than overwriting it.

Pause on offline state, exhausted retries, revoked authorization, or conflicting edits. Preserve a bounded queue/checkpoint in an appropriate secure store. Resume only after refreshing authorization if needed, reading the current document, and reconciling accepted operations. Provide a cancel/disconnect action and clear pending requests with `AbortSignal`. Never retry a non-idempotent creation blindly after an uncertain timeout.

## Timing and authorship

Record actual local `sentAt` and `acknowledgedAt` times for each request. They are observations of the network operation, not authoritative Google revision timestamps or proof of human writing. Store returned revisions/receipts separately from the local simulation log. Do not fabricate historical edits, backdate requests, alter Google revision history, or label simulated actions as original human authorship. A replay is a local replay; remote replay, if introduced, creates a **new** explicitly authorized automated session with current timestamps.

## Before shipping

Implement and test OAuth revocation, minimum scopes, conflict detection, quota exhaustion, uncertain writes, token storage, retry limits, cancellation, and disconnect recovery. Integration tests should use a dedicated Google test account and disposable documents. This architecture does not authorize any live account activity.

## Simulation Engine 2.0 event boundary

Schema 2 sessions emit positioned `insert` and `delete` events plus `stage` markers (`draft`, `revision`, `proofreading`). Positions and deletion lengths use zero-based UTF-16 offsets in the current plain-text document, before each event; translate these to the destination tab's Docs indices in the adapter. A delete's `text` describes removed content; use `deleteCount` for its range. Retain event order, including earlier-document edits. Stage and thinking events do not write content. Temporary slips carry `correction`; approved proofreading edits are regular edits in the proofreading stage. `typingMs` records planned edit effort, while `timestamp`/`atMs` record actual observation and `scheduledMs` is only a local deadline.

Use session ID plus event ordinal for ordered operation IDs. Read new events from the engine's cloned log on notifications, retaining a consumer cursor; never send replay events to Docs. `source` is the final approved output; `initialSource` and `options` retain draft evolution inputs. Existing authorization, checkpoint and reconciliation requirements still apply. No synchronization is implemented in this phase.
