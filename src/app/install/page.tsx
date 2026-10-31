import Link from "next/link";
import { ProductPage } from "@/components/product-page";
export const metadata = { title: "Install TypeFlow" };
export default function InstallPage() {
  const candidate = process.env.TYPEFLOW_CHROME_STORE_URL ?? "";
  const store =
    /^https:\/\/chromewebstore\.google\.com\/detail\/[\w-]+\/[a-p]{32}$/.test(
      candidate,
    )
      ? candidate
      : "";
  return (
    <ProductPage
      title="Your words. Right beside your document."
      intro="Use the TypeFlow Chrome extension for Google Docs, or try the local web workspace first."
    >
      <section>
        <h2>Get the Chrome extension</h2>
        {store ? (
          <a
            className="button button-primary"
            href={store}
            target="_blank"
            rel="noreferrer"
          >
            Add to Chrome ↗
          </a>
        ) : (
          <p className="restore-note">
            The Chrome Web Store listing is awaiting publication. An
            installation link will appear here when it is available. You can use
            the local workspace now.
          </p>
        )}
        <p>
          Requires desktop Chrome 120 or later and a Google account for Google
          Docs. The extension is free to use.
        </p>
        <ol>
          <li>
            Install from the Chrome Web Store, then pin TypeFlow from Chrome’s
            Extensions menu.
          </li>
          <li>
            Click the TypeFlow icon to open the side panel beside Google Docs.
          </li>
          <li>
            Connect Google, then create or select a blank document already
            authorized for TypeFlow.
          </li>
          <li>
            Choose Single Text or Draft Evolution. Paste your words, set your
            rhythm, review the approved text, and start.
          </li>
        </ol>
        <p>
          <Link href="/help">
            Read the complete writing and recovery guide →
          </Link>
        </p>
      </section>
      <section>
        <h2>Try it in this browser</h2>
        <p>
          The web workspace supports local writing simulation, preview, revision
          planning, and TXT/DOCX export. It does not require a Google account.
          Web drafts and extension drafts are stored separately on your device.
        </p>
        <Link className="button button-primary" href="/workspace">
          Open local workspace
        </Link>
      </section>
      <section>
        <h2>For release testers</h2>
        <p>
          If you received a review ZIP from the publisher, extract it, open{" "}
          <code>chrome://extensions</code>, enable Chrome’s extension Developer
          mode, and choose <strong>Load unpacked</strong> with the extracted
          folder. This Chrome setting is separate from TypeFlow’s private
          Developer Mode, which is unavailable in production.
        </p>
        <p>
          An unconfigured review build supports local previews. Google sign-in
          requires a build configured by the publisher with the matching
          extension OAuth client.
        </p>
      </section>
      <p className="honesty-note">
        TypeFlow automates text you supply. It does not generate text or prove
        original human authorship.
      </p>
    </ProductPage>
  );
}
