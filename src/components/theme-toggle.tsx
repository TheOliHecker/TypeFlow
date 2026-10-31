"use client";
import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
const subscribe = (fn: () => void) => {
  window.addEventListener("typeflow-theme", fn);
  return () => window.removeEventListener("typeflow-theme", fn);
};
export function ThemeToggle() {
  const theme = useSyncExternalStore(
    subscribe,
    () => document.documentElement.dataset.theme || "dark",
    () => "dark",
  );
  return (
    <button
      className="theme-toggle"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      onClick={() => {
        const next = theme === "dark" ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem("typeflow-theme", next);
        } catch {}
        window.dispatchEvent(new Event("typeflow-theme"));
      }}
    >
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
