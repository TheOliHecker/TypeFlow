# Production configuration

No secrets or placeholder IDs are required for the public website or local extension preview. Keep `.env.local` private; extension packaging reads **shell environment variables**, not Next.js `.env.local` automatically.

## Extension build-time values

| Variable                        | Required         | Where to obtain it / use                                                                                                                                                      |
| ------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TYPEFLOW_EXTENSION_CLIENT_ID`  | Production build | Google Cloud OAuth client of type **Chrome Extension**, bound to the real store extension ID. Public ID ending in `.apps.googleusercontent.com`. Embedded in `manifest.json`. |
| `TYPEFLOW_EXTENSION_PUBLIC_KEY` | Production build | Public package key from the Chrome Web Store draft item. Base64 DER public key; makes unpacked testing use the store’s extension ID. Public, never a private signing key.     |
| `TYPEFLOW_WEBSITE_URL`          | Production build | `https://typeflow-type-flow1.vercel.app` (HTTPS origin, no path or trailing slash). Used for Help, Privacy and Support links.                                                 |

Run `pnpm extension:review` without OAuth credentials to create a review ZIP with Google sign-in disabled. `pnpm extension:build` requires real production configuration and fails before writing a production artifact if it is missing or malformed. There is no extension client secret, API key, token variable, or runtime credentials screen.

## Website build-time values (Vercel Project → Settings → Environment Variables)

| Variable                    | Value                                                                                                                                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TYPEFLOW_CHROME_STORE_URL` | After creating the real listing: `https://chromewebstore.google.com/detail/<listing-slug>/<real-32-character-extension-id>`. Omit until available. Invalid values do not produce an install button. |
| `TYPEFLOW_SUPPORT_EMAIL`    | Publisher-confirmed support/privacy contact email. Omit until confirmed; the website uses the repository’s public issue tracker. Do not invent an email.                                            |

`/install` and `/support` are prerendered. Redeploy after changing either value. Confirm the install button points to an approved, publicly available listing before advertising availability. Production must run with `NODE_ENV=production` (Next.js build/start and Vercel set this).

Do not configure `GOOGLE_CLIENT_SECRET` or any `TYPEFLOW_DEVELOPER_*` values in the public Vercel project. Google Docs API access in production runs directly from the extension. The retained development web OAuth vault is process-local and intentionally unavailable in public production, including multi-instance/serverless hosting.

## Preserved local development values

`.env.example` also documents the old web integration (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, request limits) and local HTTPS Developer Mode controls. Those are optional development diagnostics only. A web OAuth client cannot substitute for the Chrome Extension client. The extension package never imports the server vault or developer laboratory.

## Build identity

For a production extension, the builder validates the supplied public key and prints the derived Chrome extension ID. It must match the Chrome Web Store item and the OAuth client’s Application ID. Changing IDs changes OAuth authorization and file grants. Record the ZIP’s SHA-256 file beside the release artifact; retain it for the upload and acceptance record.
