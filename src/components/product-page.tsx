import Link from "next/link";
import { Brand } from "./brand";
export function ProductPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="workspace-header">
        <Brand />
        <nav aria-label="Product navigation">
          <Link href="/install">Install</Link> ·{" "}
          <Link href="/workspace">Workspace</Link> ·{" "}
          <Link href="/help">Help</Link>
        </nav>
      </header>
      <main id="main" className="product-page">
        <span className="eyebrow accent">TYPEFLOW · WRITING IN MOTION</span>
        <h1>{title}</h1>
        <p className="product-intro">{intro}</p>
        {children}
        <footer>
          <Link href="/privacy">Privacy</Link> ·{" "}
          <Link href="/support">Support</Link> · <Link href="/">Home</Link>
        </footer>
      </main>
    </>
  );
}
