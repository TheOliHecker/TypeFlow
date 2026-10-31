# Google OAuth setup and release acceptance

The production host is the Chrome extension using `chrome.identity.getAuthToken` and only `https://www.googleapis.com/auth/drive.file`. Chrome manages access credentials; TypeFlow does not embed a client secret or persist bearer credentials in its checkpoints. A missing client ID disables sign-in in review builds. The production website is not an OAuth token proxy.

## Publisher setup (external actions required)

1. Register/sign in to the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole). Upload `release/typeflow-1.0.0-review.zip` as a **draft** only to reserve an item/extension ID. Do not submit or publish this unconfigured ZIP. Complete the publisher’s registration/payment/contact steps if required by Google.
2. Obtain the draft item’s public key from its Package section. Set `TYPEFLOW_EXTENSION_PUBLIC_KEY` to that base64 public key so the configured unpacked build has the same identity as the store package. Keep the ID and key with the release configuration; they are public identifiers.
3. In a publisher-owned [Google Cloud project](https://console.cloud.google.com/), enable **Google Docs API** and **Google Drive API**. Under Google Auth Platform, configure Branding, Audience, Data Access, and Clients. Supply the real app name, publisher support/contact details, homepage `https://typeflow-type-flow1.vercel.app`, privacy URL `/privacy`, and support URL `/support`. Verify domain ownership as required by Google; use a publisher-controlled custom domain if Google does not accept the hosting subdomain for the required verification.
4. Request only `https://www.googleapis.com/auth/drive.file` in Data Access. This is Google’s recommended non-sensitive per-file scope. Public branding/basic verification and consent-screen requirements still apply; follow the console’s current requirements. Do not request broad Drive/Documents scopes to make the file list larger.
5. Create an OAuth client of type **Chrome Extension**, with the store extension ID as its Application ID. Set `TYPEFLOW_EXTENSION_CLIENT_ID` to this client’s public ID. No web redirect URI or client secret is used by this extension flow.
6. While the OAuth app is in Testing, add the exact test accounts. To launch publicly, complete requested verification and set the audience/publishing status appropriately. Managed Workspace domains can require administrator approval independently.
7. Build with the three variables in `docs/ENVIRONMENT.md`, then run `pnpm extension:build`. Check the printed derived extension ID against the store ID and OAuth Application ID. Load `release/typeflow-1.0.0/` unpacked in desktop Chrome signed into the intended test account. Test the configured package, not a different random extension ID.
8. Complete and record every real-account check below. Upload the configured `release/typeflow-1.0.0.zip` to the same draft store item, replacing the reservation upload. Complete store privacy disclosures, listing/assets and review instructions; submit for review only after acceptance succeeds.

[Chrome OAuth instructions](https://developer.chrome.com/docs/extensions/how-to/integrate/oauth), [Identity API](https://developer.chrome.com/docs/extensions/reference/api/identity), [Drive scope guidance](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [Docs batchUpdate and write controls](https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/batchUpdate).

## Document selection

The extension lists up to 100 already-authorized Google Docs per page using Drive `files.list`, with Load more pagination. A file created by TypeFlow is authorized through `drive.file`. This list does not expose the rest of the user’s Drive, and entering an arbitrary document URL does not authorize it. Use Create blank document when the desired file is unavailable. No remotely loaded Google Picker code is embedded in the extension.

New sessions require an empty plain-text document, and never clear prior content. Recovery is bound to the original document ID and saved operation identities. The adapter rejects complex structures, tables/lists, multiple/nested tabs, objects and suggestions rather than guessing at text coordinates. Unicode uses checked UTF-16 offsets, and the Google terminal paragraph boundary is removed only from the comparison model. Unsupported control/private-use characters are rejected before starting a Google session.

## Real-account acceptance — pending until performed

Use disposable Google documents. For each check record date, configured extension version/ID, Chrome version, tester, outcome, and any issue. Do not attach private text or credentials to reports. Mocked API tests do **not** pass these checks.

- [ ] Connect through Chrome and accept the per-file scope; verify the consent screen shows the expected publisher. Decline/cancel consent and confirm an actionable error with no write.
- [ ] Create a blank document, select it, reopen the panel and select it from authorized files. Test pagination if more than 100 files are authorized. Confirm unrelated Drive files are absent.
- [ ] Attempt a new session on a nonempty document and on documents with tables, lists, suggestions, and multiple tabs. Confirm no content changes.
- [ ] Run Single Text with emoji, accents, punctuation, repeated passages and multiple/trailing paragraph breaks. Observe progressive checkpoint writes and wait for **Complete · exact match verified**. Compare the actual Google text and supplied text.
- [ ] Run Draft Evolution with each revision mode and rewrite method; include identical drafts, an empty final draft, repeated text, and reordered paragraphs. Confirm unchanged text remains and final content matches.
- [ ] Exercise pauses, resume, stop, and approved proofreading. Confirm Google-confirmed progress is separate from local progress. A request already submitted can still commit after stop.
- [ ] Interrupt the network after submission, restore/reconcile, and confirm no duplicated insertion/deletion. Disconnect/revoke during a session, reconnect, restore, and reconcile. Confirm cancellation/expiry errors never silently pass.
- [ ] Close the panel with saved progress pending. With background enabled, verify Chrome can finish it. Stop/pause should prevent future background writes. Restart Chrome and confirm interrupted new writing stays paused.
- [ ] Edit the document externally during synchronization. Confirm a revision/text conflict pauses writing without overwriting the collaborator. Restore only when the remote text matches a saved checkpoint; otherwise export and resolve manually.
- [ ] Disconnect & revoke, confirm TypeFlow access is removed from Google account connections, and verify further writes fail. Delete local data, reopen the panel and confirm drafts/checkpoints are gone while Google documents remain.
- [ ] Verify the public website’s install/help/privacy/support links from the configured extension package.

Google controls version-history grouping, visibility, revision IDs and timestamps. Tests may observe history, but no release claim promises a particular human-like pattern or one visible revision per checkpoint.

## Preserved web integration for local diagnostics

For local development only, `.env.example` includes a **Web application** client and exact redirect URI `/api/google/callback`. That flow uses state, PKCE, same-origin JSON/CSRF checks and opaque HttpOnly cookies backed by a short-lived process-local vault. Server restart or token expiry requires reconnect/recovery. It has no durable production refresh-token service and is disabled in production. Developer Mode still additionally requires its existing HTTPS loopback/password/session/optional verified-account controls; see `DEVELOPER_MODE.md`.
