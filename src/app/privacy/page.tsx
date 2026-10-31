import Link from "next/link";
import { ProductPage } from "@/components/product-page";
export const metadata = { title: "Privacy policy" };
export default function PrivacyPage() {
  return (
    <ProductPage
      title="Your writing belongs to you."
      intro="TypeFlow privacy policy · Effective October 30, 2026."
    >
      <section>
        <h2>What TypeFlow stores</h2>
        <p>
          The Chrome extension stores your supplied text, document title and
          identifier, writing settings, approved proofreading choices, session
          plan, recovery checkpoints, synchronization journal, and bounded
          request metadata on your device using Chrome local storage. The web
          workspace stores its drafts, settings, theme, and recovery information
          in that browser’s local storage. These stores are separate. Local
          storage is not encrypted by TypeFlow.
        </p>
        <p>
          Session exports include your text and actual observed event
          timestamps. Downloaded files remain wherever you save them. TypeFlow
          does not operate a cloud database for your drafts.
        </p>
      </section>
      <section>
        <h2>Google data and permissions</h2>
        <p>
          Google Docs output is optional and requires your authorization. The
          extension requests the <code>drive.file</code> scope to create
          documents and read or edit files authorized for this app. It sends
          document content, revision tokens, and edit requests directly to
          Google’s Docs and Drive APIs. Chrome’s Identity API manages OAuth
          credentials. TypeFlow does not embed a client secret, store access
          tokens in its draft storage, or send your extension credentials or
          document contents to the TypeFlow website.
        </p>
        <p>
          Authorized-file selection reads the titles and identifiers of files
          available to this app. TypeFlow does not request your email address,
          browsing history, or access to every file in Drive. Google processes
          this information under its own privacy terms.
        </p>
      </section>
      <section>
        <h2>Use, sharing, and retention</h2>
        <p>
          TypeFlow uses this data only to provide the writing workflow,
          synchronization, exports, and interruption recovery you request. It
          does not sell personal data, use it for advertising, or use Google
          user data to train general-purpose AI models. No advertising or
          analytics trackers are included. Private document text is not written
          to diagnostic logs.
        </p>
        <p>
          Local drafts and checkpoints remain until you delete them, clear
          browser storage, or uninstall the extension. Storage limits or browser
          cleanup can remove them. Google documents remain in your Drive until
          you delete them. The website hosting provider may process ordinary
          request metadata such as IP addresses and user-agent strings to serve
          and secure the site; support reports you submit are retained by the
          service you choose.
        </p>
      </section>
      <section>
        <h2>Your controls</h2>
        <p>
          Use Disconnect & revoke to revoke Google access and clear Chrome’s
          cached credentials. You can also remove TypeFlow from{" "}
          <a href="https://myaccount.google.com/connections">
            Google account connections
          </a>
          . Use the extension’s Delete local data control to remove drafts,
          settings, and recovery information after confirmation. In the web
          workspace, use Settings → Delete web data. These actions do not delete
          documents from Google Drive or copies you exported.
        </p>
        <p>
          Before deleting recovery information, inspect any uncertain Google
          write and export work you want to keep. You can delete documents
          directly in Google Drive. If you contact support, do not include
          access tokens or private document contents.
        </p>
      </section>
      <section>
        <h2>Google API Limited Use</h2>
        <p>
          TypeFlow’s use and transfer of information received from Google APIs
          adheres to the{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy">
            Google API Services User Data Policy
          </a>
          , including its Limited Use requirements.
        </p>
      </section>
      <section>
        <h2>Contact and changes</h2>
        <p>
          <Link href="/support">Contact TypeFlow support</Link> for privacy and
          deletion questions. This page will show the effective date of any
          policy changes. Changes to permissions require any consent required by
          Chrome or Google.
        </p>
      </section>
    </ProductPage>
  );
}
