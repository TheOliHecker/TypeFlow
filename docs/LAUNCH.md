# TypeFlow 1.0.0 launch

Release branch: `codex/production-launch`, based on `codex/google-docs-integration` including `4d35e7d`. Preserve the earlier engine, integration, and local Developer Mode commits when merging into `main`. Never force-push.

## Available release outputs

- `release/typeflow-1.0.0-review.zip`: bundled MV3 extension, local writing and recovery available, Google connection explicitly disabled without publisher configuration. Not a production upload.
- `release/typeflow-1.0.0-review/`: same build, for Chrome → Extensions → Developer mode → Load unpacked.
- `release/typeflow-1.0.0-review.zip.sha256`: integrity checksum for the review ZIP.
- `release/store/`: 128 px store icon, actual extension screenshots, 440×280 promotional tile, 1400×560 marquee, and `LISTING.md`.
- Next.js production output `.next/`: deployable website after `pnpm build`; source plus lockfile is the portable deployment artifact.

Build outputs/ZIPs are regenerated locally and ignored by Git. Listing content and final store artwork are committed. `pnpm store:assets` regenerates promotional artwork; `pnpm test:browser` captures actual UI screenshots. No screenshot claims a real Google connection when only a mocked/local session was used.

## Build the configured production ZIP

Obtain the actual OAuth client and store public key using [Google setup](google-docs-setup.md). Export the values from [environment configuration](ENVIRONMENT.md), then:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm extension:review
pnpm exec playwright install chromium
pnpm test:browser
pnpm format:check
pnpm extension:build
unzip -l release/typeflow-1.0.0.zip
(cd release && shasum -a 256 -c typeflow-1.0.0.zip.sha256)
```

For the checksum, use `cd release` then `shasum -a 256 -c typeflow-1.0.0.zip.sha256`. The ZIP root contains `manifest.json`, `sidepanel.html`, bundled JS/CSS and icons, with no server source, developer laboratory, `.env`, private signing key, or external JavaScript. Keep the configured ZIP and checksum together. A successful build checks configuration shape, not ownership or real OAuth validity.

The source repository contains no real OAuth client ID or Chrome store ID. Do not rename the review ZIP to imply it is configured for production.

## Deploy the public website

1. In the existing Vercel project serving `https://typeflow-type-flow1.vercel.app`, deploy the reviewed release branch (preview) and then merge/deploy `main` for production. Use the repository root, Next.js preset, Node.js 24, install `pnpm install --frozen-lockfile`, build `pnpm build`, and Vercel’s default Next output settings. No new paid infrastructure is needed.
2. Set `TYPEFLOW_SUPPORT_EMAIL` when a real address has been confirmed. The current fallback is the public GitHub issue tracker. Supply the publisher contact information required by Google and the store separately.
3. Keep `TYPEFLOW_CHROME_STORE_URL` unset until there is a real listing. After approval, set its exact URL and redeploy; confirm the public button installs the correct extension. These pages read values at build time.
4. No Google secret or developer credentials are needed on this production host. Remove any `TYPEFLOW_DEVELOPER_*` variables. Production API checks disable the old web OAuth proxy and Developer Mode independently of these values.
5. Verify `/`, `/install`, `/help`, `/privacy`, `/support`, `/workspace`, and `/settings`. Verify `/developer` and POSTs to `/api/developer/unlock` and `/api/google/batch` return 404. Test the local workspace on desktop/mobile and open the website links from the configured extension.

For another Node host, use the same build and run `pnpm start` behind HTTPS on the configured origin. The current start command binds `127.0.0.1:3000`, suitable for a local reverse proxy. Vercel supplies its own production server runtime.

## Publisher actions and approvals

- [ ] Confirm a working support/privacy contact and publisher details.
- [ ] Reserve the real Chrome store item; create the matching Chrome Extension OAuth client; record the public package key.
- [ ] Enable Docs/Drive APIs; finish Google branding/domain/audience/consent configuration and any required verification.
- [ ] Build the configured production ZIP; match derived extension ID, store ID and OAuth Application ID.
- [ ] Complete **every real-account acceptance check** in `google-docs-setup.md` against disposable documents. Record evidence and resolve failures. Automated mocks do not replace this gate.
- [ ] Check website privacy/help/support content and the store’s disclosure answers for the actual publisher and hosting configuration.
- [ ] Upload the configured ZIP, store icon and at least one real UI screenshot. Add optional promotional images. Paste `release/store/LISTING.md` content and reviewer instructions. Complete store permission/data-use certifications and obtain review approval.
- [ ] Deploy the website; test the public pages and extension links.
- [ ] Make the approved listing public; set the real store URL in Vercel and redeploy. Install from the live store in a fresh Chrome profile and repeat a short write/recovery/disconnect smoke test.
- [ ] Merge the release branch into `main` through the normal review process. Tag the exact published commit and keep the upload checksum in the release record.

## Integrity and rollback

Do not clear/rewrite a document when a sync conflict occurs. Pause, export the local preview, inspect the Google document, and preserve the journal until the uncertain write is reconciled. Checkpoint writes are durable before external writes; remote receipts are confirmed by reading actual Google text.

To pause distribution, unpublish through the store and remove the website’s install URL/redeploy. Existing installed extensions can still run; publish a reviewed update to change their behavior. Keep recovery schema compatibility and increment the manifest version for updates. There is no kill switch or cloud document store. A website rollback does not roll back installed extensions or Google document changes.
