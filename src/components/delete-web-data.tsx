"use client";
import { useState } from "react";
export function DeleteWebData() {
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState("");
  const erase = async () => {
    setMessage("");
    try {
      await navigator.locks.request(
        "typeflow-local-executor",
        { ifAvailable: true },
        (lock) => {
          if (!lock)
            throw new Error(
              "Close any active TypeFlow workspace tabs before deleting web data.",
            );
          for (const key of Object.keys(localStorage))
            if (key.startsWith("typeflow-") || key.startsWith("typeflow:"))
              localStorage.removeItem(key);
          setConfirm(false);
          setMessage(
            "Web drafts, preferences, and checkpoints deleted. Google documents and extension data are separate.",
          );
        },
      );
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  return (
    <section>
      <h2>Local web data</h2>
      <p>
        Close your workspace tabs and export anything you want to keep first.
        This removes this website’s drafts, preferences, and recovery
        checkpoints. It does not revoke Google access or delete Google
        documents.
      </p>
      <button className="button" onClick={() => setConfirm(true)}>
        Delete web data…
      </button>
      {confirm && (
        <div className="restore-note">
          <p>Remove all TypeFlow data stored by this website on this device?</p>
          <button className="button" onClick={() => void erase()}>
            Delete all web data
          </button>{" "}
          <button className="button" onClick={() => setConfirm(false)}>
            Keep data
          </button>
        </div>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
