# TypeFlow

TypeFlow is a Manifest V3 Chrome side panel for progressively writing supplied text into Google Docs, with Write, Draft Evolution, Multi-Block and Scheduled Writing modes, controlled pacing, checked revisions, exact final-text verification, and local interruption recovery. The Next.js website provides installation/help/privacy/support pages and a local preview/export workspace.

**TypeFlow automates text you provide. It does not generate writing or establish human authorship. Google controls version-history grouping and timing.**

This release preserves the integration work through `4d35e7d`. Public distribution still requires the publisher’s real extension OAuth client, Chrome Web Store identity, and real-account acceptance testing. No placeholder OAuth IDs are compiled into release functionality.

## Premium upgrade review

See the [upgrade and validation report](docs/UPGRADE_REPORT.md), [scheduling and placement guide](docs/SCHEDULING_AND_PLACEMENT.md), and [brand readiness report](docs/BRAND_READINESS.md). Scheduled work uses local verified passage checkpoints while Chrome runs on an awake computer. Placement supports user-confirmed normal body-text offsets; tables, drawings and visual cursor mapping are unsupported. Real Google OAuth and disposable-document acceptance remain launch requirements.

## Develop and verify

Node.js 24 and pnpm 11.25.0:

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm extension:review
pnpm exec playwright install chromium
pnpm test:browser
pnpm format:check
```

Open `http://127.0.0.1:3000`. Production uses Next.js’s supported webpack builder, which also works in environments where Turbopack’s local compiler socket is restricted. `pnpm start` serves the production website on that address.

## Extension and launch

- [Release instructions and final checklist](docs/LAUNCH.md)
- [Production configuration](docs/ENVIRONMENT.md)
- [Google OAuth and real-account acceptance](docs/google-docs-setup.md)
- [Chrome Web Store listing and privacy disclosures](release/store/LISTING.md)
- [Verification record](docs/VERIFICATION.md)

`pnpm extension:review` produces `release/typeflow-1.0.0-review.zip` and an unpacked folder of the same name. It supports local previews. Google connection is explicitly disabled when no OAuth client is supplied. **Do not publish this unconfigured review build.**

After obtaining the publisher-owned Chrome extension OAuth client and public key:

```sh
export TYPEFLOW_EXTENSION_CLIENT_ID='YOUR_REAL_CHROME_EXTENSION_CLIENT_ID'
export TYPEFLOW_EXTENSION_PUBLIC_KEY='YOUR_REAL_STORE_PUBLIC_KEY'
export TYPEFLOW_WEBSITE_URL='https://typeflow-type-flow1.vercel.app'
pnpm extension:build
```

The production builder rejects missing/invalid configuration and creates `release/typeflow-1.0.0.zip`, its SHA-256 checksum, and the unpacked `release/typeflow-1.0.0/` folder. Credentials in these example commands are names for external values, never bundled placeholders. The OAuth client ID and extension public key are public identifiers; no client secret belongs in the extension.

## Product behavior

Use the Chrome side panel to connect Google, create/select a blank authorized document, paste one text or initial/final drafts, adjust independent stage settings, review the final text and planned changes, then start. The same portable engine drives local preview and the Google adapter. Advanced timing, pause, typo/correction, revision, and approved proofreading controls remain available. Each stage supports 20–300 base WPM; accelerated values are labeled automation.

New sessions require blank, plain-text Google documents. The per-file authorized list includes files already available to this app; it does not browse the whole Drive or grant access by pasting an arbitrary URL. Nonempty documents and unsupported structures are rejected. Existing sessions restore from saved checkpoints. Rich-text layout, tables, lists, suggestions, embedded objects, and multiple/nested tabs are not supported.

Local progress and Google-confirmed progress are displayed separately. Writes are serialized, checked against current text/revision, journaled before submission, reconciled after uncertain results, and verified against the approved final text. Quota rejection has bounded backoff; network/5xx/authorization/conflict errors require reconciliation. A committed write whose acknowledgement was lost is confirmed rather than duplicated. Conflicts pause automation; no replacement is used to force a final match.

Keep the panel open for new writing. Optional Chrome alarms finish **already saved** synchronization after it closes; they do not generate new writing. Alarms may be delayed, and closed Chrome, device sleep, offline access, or revoked credentials prevent progress. Pause/Stop disable new background writes; submitted requests may still complete. Saved writing resumes paused after interruption.

Drafts, preferences, recovery checkpoints, and bounded synchronization metadata are stored on the device. Chrome manages extension OAuth credentials; the extension sends authorized document operations directly to Google. It includes no analytics, content scripts, broad browsing access, remote JavaScript, or paid backend. Local data is not encrypted by TypeFlow. Deletion and disconnect/revocation controls are separate; neither deletes Google documents.

## Website deployment

Use the existing Vercel project for `https://typeflow-type-flow1.vercel.app`, or any Node-compatible Next.js host. Install with `pnpm install --frozen-lockfile`, build with `pnpm build`, and use Node.js 24. Set the optional store URL and confirmed support email described in [environment configuration](docs/ENVIRONMENT.md) before building. Until a real store URL is configured, `/install` truthfully says publication is pending.

The production website needs no Google client secret, database, or paid infrastructure. Google writing runs in the extension. The preserved process-local web OAuth integration and private Developer Mode are development-only and return 404 in production. Developer Mode retains its local HTTPS/password/session/allowlist controls; see [Developer Mode](docs/DEVELOPER_MODE.md).

## Architecture

- `extension/src/`: side panel, Chrome Identity transport, durable storage mirror, single-owner lock, background checkpoint worker.
- `src/lib/simulation/`: portable engine, checked UTF-16 operations, deterministic plans, revisions, checkpoint validation, journal/executor, replay and proofreading.
- `src/lib/google/`: shared Google Docs adapter and synchronization coordinator; development-only server host.
- `src/components/`: shared settings/proofreading and web preview/export UI.
- `src/app/`: public website, install/help/privacy/support pages, local workspace and protected development routes.
- `scripts/`: extension packaging and store artwork generation.
- `e2e/`: actual Chromium extension package and production website checks.

Inputs are limited to 100,000 UTF-16 units. Unicode/graphemes and paragraph spacing are preserved, subject to Google’s supported plain-text character set. Checkpoints are size-limited; large plans may exceed safe recovery storage and are blocked from remote synchronization. Browser scheduling and API quotas can increase actual duration. Export important work before clearing storage.
