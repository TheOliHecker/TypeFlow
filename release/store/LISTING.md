# Chrome Web Store listing — TypeFlow 1.0.0

Publisher must enter the real extension ID, confirmed support/contact details, and configured ZIP in the store dashboard. No unconfigured review ZIP should be submitted for public release.

## Name

TypeFlow — Writing in motion

## Summary (under 132 characters)

Bring your text to Google Docs with controlled pacing, draft revisions, verified synchronization, and local recovery.

## Detailed description

Your words. Their own rhythm.

TypeFlow turns text you provide into a transparent automated writing session in Google Docs. Keep its side panel beside your document, choose your pace, preview the final text, and stay in control from start to finish.

• Single Text progressively writes one supplied text.
• Draft Evolution writes your initial draft, then applies your approved final draft with checked revision operations.
• Independent writing and revision settings include 20–300 WPM, thinking pauses, variation, automatically corrected typing slips, and advanced timing/revision controls.
• Optional local proofreading applies only the suggestions you approve.
• Pause, resume, stop, export your preview, and restore interrupted sessions from local checkpoints.
• See local progress separately from Google-confirmed characters, pending operations, and the last successful synchronization.
• Google output is marked complete only after exact final-text verification.

Connect Google and create or select a blank document already authorized for TypeFlow. The extension uses Google's per-file access scope, rather than requesting your whole Drive. New sessions never clear existing writing. Documents containing tables, lists, suggestions, embedded objects, or multiple/nested tabs are not supported.

Keep the panel open while new writing runs. If enabled, Chrome can finish already saved synchronization after the panel closes; new writing waits until you reopen and resume. Browser shutdown, device sleep, offline access, API limits, and authorization changes can delay or prevent progress. A request already submitted may finish after Pause or Stop. External edits cause a conflict that needs attention instead of being overwritten.

Drafts, preferences, and recovery records stay on your device. Chrome manages sign-in credentials, and authorized document content is sent directly to Google. There are no advertising or analytics trackers. Disconnect/revoke and local-data deletion controls are included. Removing local data does not delete documents in your Google Drive.

TypeFlow automates writing you supply; it does not generate text or establish human authorship. Google controls version-history grouping and timestamps. No particular version-history pattern is promised.

Free to use. Requires desktop Chrome 120+ and a Google account for Google Docs. A local preview mode works without Google authorization.

## Links and category

- Category: Productivity
- Language: English
- Homepage: https://typeflow-type-flow1.vercel.app
- Privacy: https://typeflow-type-flow1.vercel.app/privacy
- Support: https://typeflow-type-flow1.vercel.app/support
- Publisher email: enter a real confirmed address in the dashboard; none is invented in source.

## Single purpose and permission justifications

Single purpose: progressively apply user-supplied text and approved revisions to a user-authorized Google document, with visible progress and safe interruption recovery.

| Permission               | Justification                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `sidePanel`              | Hosts the writing controls beside the user's document.                                                                                      |
| `storage`                | Device-local drafts, settings, validated checkpoints, and write-ahead recovery journal. Not Chrome Sync storage.                            |
| `identity`               | Uses Chrome-managed Google OAuth access; no embedded client secret.                                                                         |
| `alarms`                 | Wakes the service worker to reconcile/drain saved checkpoint synchronization. Does not claim exact timing or continuous background writing. |
| `docs.googleapis.com`    | Read/create authorized Docs, conditionally apply edits, verify text/revision.                                                               |
| `www.googleapis.com`     | List already-authorized, non-trashed Google Docs through Drive API.                                                                         |
| `oauth2.googleapis.com`  | Revoke Google authorization when the user disconnects.                                                                                      |
| `drive.file` OAuth scope | Access only files created/authorized for this app; avoids whole-Drive access.                                                               |

No content scripts, browsing-history, tabs, scripting, clipboard, downloads, webRequest, all-sites, or remote-code permissions. Download links use standard browser Blob URLs.

## Privacy questionnaire preparation

Review the dashboard's current definitions and certify the answers for the real publisher. TypeFlow handles user-provided document text/titles and document IDs (content), OAuth bearer credentials managed by Chrome and sent to Google (authentication), and local session timestamps/settings/checkpoints. Document content is transmitted to Google when the user selects Google Docs; it is not sent to the TypeFlow website. The website host processes ordinary request metadata. Disclose this handling even though TypeFlow has no cloud draft database.

No advertising, data sale, analytics/tracking SDKs, model training, unrelated browsing collection, or third-party text-generation service is included. Data use is limited to the user-facing writing/sync/recovery functionality. Do not certify that no data is ever transmitted. Confirm Limited Use compliance and the public policy matches actual deployment before submission.

## Reviewer instructions

Use the **configured production ZIP** and a Chrome profile signed into a Google account allowed by the OAuth app's current audience. No TypeFlow account or password is required. The publisher must make OAuth accessible to reviewers; do not leave only private test accounts authorized when requesting a public review.

1. Open the side panel via the toolbar action; choose Google Docs → Connect Google.
2. Create a blank document. Enter a short disposable text, select a fast pace, inspect the preview, check the review box, and Start writing.
3. Wait for local completion and “Complete · exact match verified” in the separate Google status. Open the Google document from the panel.
4. Repeat with Draft Evolution and a changed final draft in a fresh blank document. Existing nonempty documents are deliberately rejected for new sessions.
5. Pause/resume/stop, reopen and restore a saved session, then reconcile. Inspect Privacy & local data, and Disconnect & revoke. Do not test destructive edits in personal documents.

Local preview is available without Google. Unconfigured review builds display a setup error and are not release submissions.

## Assets

- `icon-128.png`: 128×128 store/extension icon.
- `screenshot-01-setup.png`: 1280×800 actual extension UI, local setup.
- `screenshot-02-session.png`: 1280×800 actual extension UI, completed local revision preview.
- `promo-440x280.png`: optional small promotional image.
- `marquee-1400x560.png`: optional marquee image.
- `panel-actual.png`: full-height QA capture, not a required-size listing screenshot.

Screenshots are captured from the real extension UI, using local disposable text. They are not evidence that a real Google authorization or API write passed. Dimensions follow [Chrome's image guidance](https://developer.chrome.com/docs/webstore/images); confirm the dashboard accepts them at submission.
