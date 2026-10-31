"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function DeveloperUnlock() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <details>
      <summary>Unlock Developer Mode</summary>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const form = e.currentTarget;
          const password = String(new FormData(form).get("password") ?? "");
          form.reset();
          try {
            const response = await fetch("/api/developer/unlock", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-TypeFlow-Request": "1",
              },
              body: JSON.stringify({ password }),
            });
            if (!response.ok)
              throw new Error(
                "Unlock failed. Check the password, local configuration, and five-attempt / 15-minute limit.",
              );
            router.push("/developer");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Developer password{" "}
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={1024}
          />
        </label>
        <button disabled={busy}>Unlock</button>
        <p role="alert">{error}</p>
      </form>
    </details>
  );
}
