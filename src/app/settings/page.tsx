import { DeleteWebData } from "@/components/delete-web-data";
import Link from "next/link";
import { DeveloperUnlock } from "@/components/developer-unlock";
import { securityConfig } from "@/lib/developer/auth";
export const dynamic = "force-dynamic";
export default function SettingsPage() {
  let enabled = false;
  try {
    securityConfig();
    enabled = true;
  } catch {}
  return (
    <main className="dev-shell">
      <Link href="/workspace">← Workspace</Link>
      <h1>Settings</h1>
      <p>Writing preferences remain available in your workspace.</p>
      <p>
        <Link href="/install">Install the Chrome extension</Link> ·{" "}
        <Link href="/privacy">Privacy</Link> ·{" "}
        <Link href="/support">Support</Link>
      </p>
      <DeleteWebData />
      {enabled && (
        <>
          <hr />
          <h2>Developer Mode</h2>
          <p>Private local diagnostics for automated test activity.</p>
          <DeveloperUnlock />
        </>
      )}
    </main>
  );
}
