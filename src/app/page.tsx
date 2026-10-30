import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  Check,
  Feather,
  Fingerprint,
  Gauge,
  LockKeyhole,
  MoveUpRight,
  RotateCcw,
  Sparkles,
  Timer,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { LandingDemo } from "@/components/landing-demo";
const features = [
  {
    icon: Gauge,
    title: "Find your tempo.",
    text: "From a thoughtful 20 to a flowing 200 words per minute. Set the pace and let natural variation do the rest.",
    detail: "YOUR PACE, YOUR PROCESS",
  },
  {
    icon: Timer,
    title: "Make room for a pause.",
    text: "Give ideas a moment to breathe. Add thinking pauses and small, automatically corrected typos.",
    detail: "THE LITTLE DETAILS MATTER",
  },
  {
    icon: RotateCcw,
    title: "Watch it all unfold. Again.",
    text: "Replay your session, explore every event, and export your words as a text file or Word document.",
    detail: "EVERY MOMENT, REPLAYABLE",
  },
];
const faqs = [
  [
    "What exactly does TypeFlow do?",
    "TypeFlow takes text you provide and reveals it progressively in a simulated writing environment. You control the typing speed, pauses, and automatic typo corrections, then replay or export the result.",
  ],
  [
    "Is TypeFlow really free?",
    "Yes. All current features are free, with no account, subscription, or paid API required. Everything runs in your browser.",
  ],
  [
    "Does TypeFlow write or generate my text?",
    "No. You bring the words. TypeFlow animates how they appear. Simulated activity is always identified as automated and is not proof of human authorship.",
  ],
  [
    "Where is my writing stored?",
    "Your draft and preferences are saved in this browser’s local storage. They are not sent to a server. Full session event logs stay in memory unless you download them.",
  ],
  [
    "Can I connect Google Docs?",
    "Not yet. A future integration is planned for authorized Google Docs edits with real timestamps and clear automation labels. Today you can export a DOCX or TXT file.",
  ],
];
export default function Home() {
  return (
    <>
      <header className="site-header">
        <div className="container nav-inner">
          <Brand />
          <nav aria-label="Main navigation">
            <a href="#features">Features</a>
            <a href="#how-it-works">How it works</a>
            <a href="#faq">FAQs</a>
          </nav>
          <Link href="/workspace" className="button button-dark nav-cta">
            Open workspace <ArrowUpRightIcon />
          </Link>
        </div>
      </header>
      <main id="main">
        <section className="hero container">
          <div className="hero-tag">
            <span className="blue-dot" /> A little more flow. A lot more
            possibility.<span className="new-tag">FREE TO USE</span>
          </div>
          <h1>
            Bring Your Writing
            <br />
            to <span className="hero-italic">Life.</span>
            <span className="headline-cursor" />
          </h1>
          <p className="hero-description">
            Your words. Their own rhythm.
            <br />
            Turn any text into a natural writing simulation.
            <br className="mobile-break" /> Set the pace, press play, and watch
            it flow.
          </p>
          <div className="hero-actions">
            <Link href="/workspace" className="button button-primary">
              Start Writing — Free <ArrowRight size={17} />
            </Link>
            <a className="button button-quiet" href="#preview">
              See it in action <ArrowDown size={15} />
            </a>
          </div>
          <div className="hero-reassurance">
            <span>
              <Check size={13} /> No sign-up
            </span>
            <span>
              <Check size={13} /> No limits on creativity
            </span>
            <span>
              <Check size={13} /> Just your words
            </span>
          </div>
          <div className="hero-side-note">
            <svg width="70" height="45" viewBox="0 0 70 45" fill="none">
              <path
                d="M4 4C50 0 65 15 44 36M43 24l1 13 13-3"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
            <span>
              less rush,
              <br />
              more rhythm.
            </span>
          </div>
          <LandingDemo />
        </section>
        <section className="trust-strip container">
          <span>A calmer way to bring words to the screen.</span>
          <div>
            <span>
              <LockKeyhole size={15} /> Private by design
            </span>
            <span>
              <Feather size={15} /> Thoughtfully simple
            </span>
            <span>
              <Fingerprint size={15} /> Honestly automated
            </span>
          </div>
        </section>
        <section className="section container" id="features">
          <div className="section-heading">
            <div>
              <span className="eyebrow accent">
                SMALL DETAILS. BETTER FLOW.
              </span>
              <h2>
                A writing experience
                <br />
                with a rhythm of its own.
              </h2>
            </div>
            <p>
              A few thoughtful controls.
              <br />A whole different feeling.
            </p>
          </div>
          <div className="feature-grid">
            {features.map(({ icon: Icon, title, text, detail }, i) => (
              <article className="feature-card" key={title}>
                <div className={`feature-visual visual-${i}`}>
                  <Icon size={23} />
                  {i === 0 ? (
                    <div className="tempo-lines">
                      {[16, 24, 37, 49, 60, 45, 31, 42, 55, 34, 20, 14].map(
                        (h, j) => (
                          <i key={j} style={{ height: h }} />
                        ),
                      )}
                    </div>
                  ) : i === 1 ? (
                    <div className="pause-illustration">
                      A moment to{" "}
                      <span>
                        think
                        <span className="typing-cursor" />
                      </span>
                      <i>…</i>
                    </div>
                  ) : (
                    <div className="replay-illustration">
                      <span>00:00</span>
                      <div>
                        <i />
                      </div>
                      <RotateCcw size={18} />
                      <span>01:24</span>
                    </div>
                  )}
                </div>
                <span className="eyebrow">{detail}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="how-section" id="how-it-works">
          <div className="container how-layout">
            <div>
              <span className="eyebrow accent">FROM TEXT TO MOTION</span>
              <h2>
                Three steps.
                <br />
                <em>One lovely flow.</em>
              </h2>
              <p>
                No setup. No learning curve.
                <br />
                Just a fresh space for your words.
              </p>
              <Link href="/workspace" className="text-link">
                Find your flow <ArrowRight size={16} />
              </Link>
            </div>
            <ol className="steps">
              {[
                [
                  "01",
                  "Bring your words.",
                  "Paste a paragraph, a rough draft, or the next big idea. Give it a title and make yourself at home.",
                ],
                [
                  "02",
                  "Set your rhythm.",
                  "Pick a typing speed. Add a thinking pause or two. Make the experience feel right for your text.",
                ],
                [
                  "03",
                  "Press play. Let it unfold.",
                  "Watch your text come to life. Pause, replay, or take your finished document with you.",
                ],
              ].map(([n, title, text]) => (
                <li key={n}>
                  <span className="step-number">{n}</span>
                  <div>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
        <section className="section container faq-section" id="faq">
          <div>
            <span className="eyebrow accent">A LITTLE CLARITY</span>
            <h2>
              Good questions.
              <br />
              Straight answers.
            </h2>
            <p>Less wondering. More writing.</p>
          </div>
          <div className="faq-list">
            {faqs.map(([q, a]) => (
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
          <div className="cta-spark">
            <Sparkles size={24} />
          </div>
          <span className="eyebrow accent">YOUR NEXT IDEA IS WAITING</span>
          <h2>Let your words find their flow.</h2>
          <p>A blank page. A fresh perspective. A little TypeFlow.</p>
          <Link href="/workspace" className="button button-primary">
            Start Writing — Free <ArrowRight size={17} />
          </Link>
          <span className="cta-footnote">Free to use. Yours to explore.</span>
        </section>
      </main>
      <footer className="site-footer container">
        <div>
          <Brand />
          <p>A little more rhythm for your words.</p>
        </div>
        <span>
          Built for words. Designed for you.
          <br />
          <small>
            © {new Date().getFullYear()} TypeFlow · Automated, transparently.
          </small>
        </span>
        <Link href="/workspace" className="footer-source">
          Find your flow <MoveUpRight size={13} />
        </Link>
      </footer>
    </>
  );
}
function ArrowUpRightIcon() {
  return <MoveUpRight size={15} />;
}
