import type { Metadata } from "next";
import { ThemeToggle } from "@/components/theme-toggle";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "TypeFlow — Bring Your Writing to Life", template: "%s · TypeFlow" },
  description: "Turn your text into a thoughtful writing simulation. Customize the pace, watch it unfold, and replay every moment. Free, private, and in your browser.",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body><script dangerouslySetInnerHTML={{ __html: `try{let t=localStorage.getItem('typeflow-theme');document.documentElement.dataset.theme=t||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}catch{}` }} /><a className="skip-link" href="#main">Skip to content</a>{children}<ThemeToggle /></body></html>;
}
