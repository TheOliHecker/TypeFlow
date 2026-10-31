import Link from "next/link";
import { ProductPage } from "@/components/product-page";
export const metadata = { title: "Writing & recovery guide" };
export default function HelpPage() {
  return (
    <ProductPage
      title="A little clarity. Then, your flow."
      intro="From your first connection to your final verified document."
    >
      <section>
        <h2>1. Install and connect</h2>
        <p>
          <Link href="/install">Install TypeFlow</Link> in desktop Chrome. Open
          its side panel and select Google Docs. Click Connect Google and
          approve access to files used with TypeFlow. Chrome manages
          authentication for the Google account signed into Chrome; to use
          another account, use its Chrome profile.
        </p>
        <p>
          TypeFlow requests per-file access, rather than access to your entire
          Drive. Create a blank document in the panel or select a blank document
          from its authorized-file list. Files not previously authorized for
          this app will not appear. You can open the selected document directly
          from the panel.
        </p>
      </section>
      <section>
        <h2>2. Configure and preview</h2>
        <p>
          Single Text progressively writes the text you provide. Draft Evolution
          writes the initial draft first, then applies the changes needed for
          the final draft. An empty final draft removes the initial text;
          inspect the preview before approving it.
        </p>
        <p>
          Set each stage’s pace from 20–300 WPM, thinking pauses, and
          automatically corrected typing slips. Advanced settings include pause
          ranges, variation, correction timing, revision method, and a
          reproducible seed. Optional proofreading changes wording only after
          you approve a specific suggestion. Custom durations must be feasible
          and are estimates.
        </p>
        <p>
          Review the final text and planned changes, then check the review box.
          New sessions require a blank plain-text document. TypeFlow rejects
          existing writing, complex layouts, lists, tables, embedded objects,
          suggested edits, and multiple or nested tabs. Use a fresh document for
          each new session.
        </p>
      </section>
      <section>
        <h2>3. Write and monitor</h2>
        <p>
          Keep the panel open while writing. The local preview and writing
          percentage show engine progress. The separate Google status shows
          confirmed characters, pending operations, and the last successful
          synchronization. Checkpoints normally synchronize about every 30
          seconds; a backlog may take longer. A session is finished in Google
          only when TypeFlow reports an exact final-text match.
        </p>
        <p>
          Pause freezes new writing and synchronization. Resume reconciles saved
          progress before continuing. Stop keeps the recoverable partial
          session. An already submitted Google request may still complete after
          Pause or Stop. Export the preview or session log whenever you need a
          local copy.
        </p>
      </section>
      <section>
        <h2>4. Recover after an interruption</h2>
        <ol>
          <li>
            Reopen the panel and choose Restore paused for the saved session.
          </li>
          <li>If Google authorization expired, click Reconnect Google.</li>
          <li>
            Click Reconcile & sync saved progress. TypeFlow reads Google’s
            current text and compares it with the saved before/after checkpoints
            before any retry.
          </li>
          <li>
            Resume writing after reconciliation succeeds. If Google contains
            collaborator edits, export your local preview and inspect the
            document. TypeFlow will not overwrite the conflict to force a match.
          </li>
        </ol>
        <p>
          If a write committed but its response was lost, recovery confirms that
          write instead of duplicating it. If a document differs from both
          checkpoints, automated writing stops and requires attention. Reconcile
          uncertain writes before discarding recovery information.
        </p>
      </section>
      <section>
        <h2>Background synchronization</h2>
        <p>
          With “Finish saved synchronization” enabled, Chrome can send already
          saved progress after the panel closes. It does not generate new
          writing while the panel is closed. Chrome can delay alarms or suspend
          work; a closed browser, sleeping computer, offline device, revoked
          access, or storage error can prevent synchronization. Reopen and
          restore to continue. Pause and Stop disable new background writes.
        </p>
      </section>
      <section>
        <h2>Disconnect and delete data</h2>
        <p>
          Disconnect & revoke pauses the session and asks Google to revoke
          access, then clears Chrome’s cached credentials. If revocation cannot
          be confirmed, retry or remove TypeFlow from{" "}
          <a
            href="https://myaccount.google.com/connections"
            target="_blank"
            rel="noreferrer"
          >
            Google account connections
          </a>
          .
        </p>
        <p>
          Privacy & local data → Delete local data removes extension drafts,
          settings, and recovery checkpoints after confirmation. Export first.
          Google documents remain in Drive and can be deleted there. To clear
          web workspace data, use Settings → Delete web data. Uninstalling the
          extension removes its local storage; it does not delete Google
          documents.
        </p>
      </section>
      <section>
        <h2>About automation and history</h2>
        <p>
          TypeFlow records actual observed execution times. Google determines
          how API changes appear in version history. TypeFlow does not promise
          particular version timestamps, named revisions, or edit grouping.
          Simulated activity does not establish independent human authorship.
        </p>
      </section>
      <p>
        Still stuck? <Link href="/support">Get support →</Link>
      </p>
    </ProductPage>
  );
}
