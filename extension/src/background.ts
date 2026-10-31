import { tickJob, interruptRunningJob } from "./jobs";
import { SimulationEngine } from "../../src/lib/simulation/engine";
import { BrowserSessionStorage } from "../../src/lib/simulation/session";
import { GoogleSyncCoordinator, loadBinding } from "../../src/lib/google/sync";
import { extensionGoogleTransport } from "./google";
import {
  ExtensionStorage,
  OWNER_LOCK,
  BACKGROUND,
  BACKGROUND_ERROR,
} from "./storage";

const ALARM = "typeflow-checkpoint-sync";
async function ensureAlarm() {
  for (const name of [ALARM, "typeflow-scheduled-writing"]) {
    if (!chrome.alarms.get || !(await chrome.alarms.get(name)))
      await chrome.alarms.create(name, { periodInMinutes: 0.5 });
  }
}
chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  void chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  void ensureAlarm();
});
chrome.runtime.onStartup.addListener(() => {
  void interruptRunningJob();
  void ensureAlarm();
});
/** No source text, token, or detailed upstream error is ever logged. */
export async function synchronizeSavedCheckpoint() {
  await navigator.locks.request(
    OWNER_LOCK,
    { ifAvailable: true },
    async (lock) => {
      if (!lock) return; // A live panel owns the engine and journal.
      const storage = await ExtensionStorage.open();
      const id = storage.getItem(BACKGROUND);
      if (!id) return;
      let sync: GoogleSyncCoordinator | undefined;
      const engine = new SimulationEngine();
      try {
        const saved = new BrowserSessionStorage(storage).load(id);
        const binding = loadBinding(storage, id);
        if (!saved || !binding)
          throw new Error(
            "Saved synchronization is incomplete. Reopen TypeFlow to inspect recovery.",
          );
        engine.recover(saved); // Remains paused; never fabricate writing while asleep.
        sync = new GoogleSyncCoordinator(
          engine,
          storage,
          extensionGoogleTransport,
          binding,
          (view) => {
            if (view.error) storage.setItem(BACKGROUND_ERROR, view.error);
          },
          undefined,
          30_000,
          storage.flush,
        );
        await sync.initialize();
        const drained = await sync.synchronizeCheckpoint();
        if (drained) storage.removeItem(BACKGROUND);
        storage.removeItem(BACKGROUND_ERROR);
      } catch {
        storage.removeItem(BACKGROUND); // User action required; avoid endless automatic retries.
        if (!storage.getItem(BACKGROUND_ERROR))
          storage.setItem(
            BACKGROUND_ERROR,
            "Background synchronization needs attention. Connect Google if needed, restore the saved session, then reconcile.",
          );
      } finally {
        sync?.dispose();
        engine.dispose();
        await storage.flush();
      }
    },
  );
}
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "typeflow-scheduled-writing")
    void tickJob().catch(() => {
      void chrome.action.setBadgeText({ text: "!" });
    });
  if (alarm.name === ALARM)
    void synchronizeSavedCheckpoint().catch(() => {
      // A local storage failure cannot safely be repaired by writing remotely.
      void chrome.action.setBadgeText({ text: "!" });
    });
});

// Recreate alarms on worker initialization too (Chrome 120 compatibility).
void ensureAlarm();
