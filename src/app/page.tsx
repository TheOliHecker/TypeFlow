import Link from "next/link";
import { Brand } from "@/components/brand";
import { LandingDemo } from "@/components/landing-demo";
const features = [
  [
    "01",
    "Scheduled Writing",
    "Make time for the next draft.",
    "Define writing windows and separate draft stages. Approved changes run as verified passage checkpoints while Chrome is awake.",
  ],
  [
    "02",
    "Multi-Block",
    "Every answer in its place.",
    "Name your blocks, confirm body-text positions, and preview the complete result before writing into an authorized document.",
  ],
  [
    "03",
    "Draft Evolution",
    "Refine the passage. Keep the context.",
    "Compare drafts, approve major revisions, and replace changed passages at their original positions. Unchanged text stays in place.",
  ],
];
export default function Home() {
  return (
    <>
      <header className="site-header">
        <div className="container nav-inner">
          <Brand />
          <nav aria-label="Main navigation">
            <a href="#features">Product</a>
            <a href="#how-it-works">How it works</a>
            <Link href="/help">Help</Link>
          </nav>
          <Link className="button button-primary" href="/install">
            Get the extension ↗
          </Link>
        </div>
      </header>
      <main id="main">
        <section className="premium-hero container">
          <span className="release-label">
            <span className="blue-dot" /> BUILT FOR GOOGLE DOCS · LOCAL REVIEW
            BUILD
          </span>
          <h1>
            Your writing.
            <br />
            <span>Your schedule.</span>
          </h1>
          <p>
            Bring your words to Google Docs.
            <br />
            Place answers, plan writing windows, and revise drafts with precise
            control.
          </p>
          <div className="hero-actions">
            <Link href="/install" className="button button-primary">
              Get the Chrome extension ↗
            </Link>
            <Link href="/workspace" className="button button-quiet">
              Try the browser demo →
            </Link>
          </div>
          <p className="hero-caption">
            No paid APIs. No cloud workers. Your document stays in your control.
          </p>
        </section>
        <section
          className="container product-demo-section"
          aria-label="Interactive local product demo"
        >
          <div className="demo-heading">
            <span>TYPEFLOW / INTERACTIVE LOCAL PREVIEW</span>
            <Link href="/workspace">Open demo ↗</Link>
          </div>
          <LandingDemo />
          <p className="hint">
            This interactive preview runs locally. Google Docs writing requires
            the extension and a configured Google connection.
          </p>
        </section>
        <section className="container section" id="features">
          <div className="section-heading">
            <div>
              <span className="eyebrow accent">A CLEARER WAY TO WORK</span>
              <h2>
                From first draft
                <br />
                to exactly where it belongs.
              </h2>
            </div>
            <p>
              Simple controls.
              <br />
              Deliberate execution.
            </p>
          </div>
          <div className="premium-features">
            {features.map(([n, label, title, copy]) => (
              <article key={n}>
                <span className="feature-number">
                  {n} / {label}
                </span>
                <h3>{title}</h3>
                <p>{copy}</p>
                <Link href="/install">Explore in the extension ↗</Link>
              </article>
            ))}
          </div>
        </section>
        <section className="container safety-section">
          <span className="eyebrow accent">CONFIRMED, NOT ASSUMED</span>
          <h2>Your document deserves care.</h2>
          <div className="premium-features">
            {[
              [
                "Review before writing",
                "Approve the intended result and major revision groups before execution.",
              ],
              [
                "Check every checkpoint",
                "Conditional Google revisions protect against conflicting edits. Ambiguous writes require reconciliation.",
              ],
              [
                "Recover with context",
                "A local durable journal records confirmed progress. Interruptions pause work instead of triggering a catch-up batch.",
              ],
            ].map(([title, copy]) => (
              <article key={title}>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
          <p className="hint">
            Real Google OAuth and disposable-document acceptance testing remains
            a release requirement. Automation does not establish original human
            authorship.
          </p>
        </section>
        <section className="section container" id="how-it-works">
          <span className="eyebrow accent">RIGHT BESIDE YOUR DOCUMENT</span>
          <h2>Set up once. Stay in control.</h2>
          <ol className="onboarding-steps">
            {[
              [
                "Install the review build",
                "The Chrome Web Store release is not yet published. Local testers can load the configured extension.",
              ],
              [
                "Connect an authorized document",
                "Connect Google using the existing drive.file permission, then create or select a supported document.",
              ],
              [
                "Preview, approve, and write",
                "Choose Write, Draft Evolution, Multi-Block, or Schedule. Review the plan and track confirmed progress.",
              ],
            ].map(([t, c], i) => (
              <li key={t}>
                <span>0{i + 1}</span>
                <div>
                  <h3>{t}</h3>
                  <p>{c}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <section className="section container faq-section">
          <div>
            <span className="eyebrow accent">THE DETAILS</span>
            <h2>
              Clear expectations.
              <br />
              Better writing sessions.
            </h2>
          </div>
          <div className="faq-list">
            {[
              [
                "Does it generate my writing?",
                "No. You supply and approve every draft. TypeFlow automates entry and revisions; it does not prove human authorship.",
              ],
              [
                "Will schedules run with my computer off?",
                "No. Your computer must be awake with Chrome running. Missed or interrupted windows need review and rescheduling. Finish times are estimates.",
              ],
              [
                "Can I use a worksheet or table?",
                "Multi-Block supports confirmed positions in normal Google Docs body text. Tables, drawings, text boxes, nested tabs, PDFs and Slides are unsupported by this release.",
              ],
              [
                "Where is my content stored?",
                "Drafts, checkpoints and schedules are stored locally. Approved text is sent to Google when you use Docs output. There are no analytics or paid background services.",
              ],
              [
                "Can I install from the Chrome Web Store?",
                "Publication is pending. The installation page distinguishes local review builds and the future store release.",
              ],
            ].map(([q, a]) => (
              <details key={q}>
                <summary>
                  {q}
                  <span>+</span>
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="bottom-cta container">
          <span className="eyebrow accent">MAKE SPACE FOR THE WORK</span>
          <h2>A more deliberate writing workflow.</h2>
          <Link href="/install" className="button button-primary">
            Get started with the extension ↗
          </Link>
        </section>
      </main>
      <footer className="premium-footer container">
        <Brand />
        <span>Your writing. Your schedule.</span>
        <Link href="/privacy">Privacy</Link>
        <Link href="/support">Support</Link>
        <Link href="/help">Documentation</Link>
      </footer>
    </>
  );
}
