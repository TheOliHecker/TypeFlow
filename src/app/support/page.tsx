import { ProductPage } from "@/components/product-page";
export const metadata = { title: "Support" };
export default function SupportPage() {
  const value = process.env.TYPEFLOW_SUPPORT_EMAIL ?? "";
  const email = /^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(value) ? value : "";
  return (
    <ProductPage
      title="Let’s get you writing again."
      intro="Help with connection, synchronization, recovery, and privacy."
    >
      <section>
        <h2>Contact TypeFlow</h2>
        {email ? (
          <p>
            Email <a href={`mailto:${email}`}>{email}</a>.
          </p>
        ) : (
          <p>
            Report a problem or ask a question through{" "}
            <a href="https://github.com/TheOliHecker/TypeFlow/issues">
              TypeFlow’s GitHub issue tracker
            </a>
            . Reports there are public.
          </p>
        )}
        <p>
          Include your Chrome version, TypeFlow version, the action you tried,
          and the visible error message. Do not include document contents, OAuth
          credentials, access tokens, or a session log containing private
          writing. For a writing problem, use a small disposable example if
          possible.
        </p>
      </section>
      <section>
        <h2>Connection problems</h2>
        <p>
          Reconnect Google from the extension, confirm that Docs and Drive
          access is permitted, then restore and reconcile the saved session. For
          an unconfigured review build, the publisher must supply the extension
          OAuth client before sign-in can work.
        </p>
      </section>
      <section>
        <h2>Synchronization stopped</h2>
        <p>
          Check your connection and free device storage. Restore the session,
          reconnect if needed, and reconcile before resuming. If a collaborator
          changed the document, export your preview and inspect the document. Do
          not delete recovery data until you have checked any uncertain write.
        </p>
      </section>
      <section>
        <h2>Privacy and deletion</h2>
        <p>
          Use the local deletion controls described in the{" "}
          <a href="/privacy">privacy policy</a>. Google documents can be deleted
          directly from Drive. Remove authorization through{" "}
          <a href="https://myaccount.google.com/connections">
            Google account connections
          </a>{" "}
          if in-app revocation cannot be completed.
        </p>
      </section>
    </ProductPage>
  );
}
