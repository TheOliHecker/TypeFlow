import {
  AdapterExecutor,
  type WriteAhead,
} from "../../src/lib/simulation/adapters";
import { GoogleDocsOutputAdapter } from "../../src/lib/google/adapter";
import {
  JOB_KEY,
  JOB_LOCK,
  wakeDecision,
  type Job,
} from "../../src/lib/automation/jobs";
import { extensionGoogleTransport } from "./google";
import { BACKGROUND, OWNER_LOCK } from "./storage";
const JOURNAL = "typeflow-job-journal:";
export async function readJob(): Promise<Job | null> {
  const data = await chrome.storage.local.get(JOB_KEY);
  return data[JOB_KEY] ? (JSON.parse(String(data[JOB_KEY])) as Job) : null;
}
export async function saveJob(job: Job) {
  await chrome.storage.local.set({ [JOB_KEY]: JSON.stringify(job) });
}
export async function tickJob(now = Date.now()) {
  await navigator.locks.request(JOB_LOCK, async () => {
    const job = await readJob();
    if (!job) return;
    const decision = wakeDecision(job, now);
    if (decision === "wait") return;
    if (decision !== "run") {
      job.status = decision;
      job.message =
        "Window missed or device interrupted. Review the document, then reschedule remaining checkpoints.";
      await saveJob(job);
      await chrome.action.setBadgeText({ text: "!" });
      return;
    }
    const legacy = await chrome.storage.local.get(BACKGROUND);
    const ownerBusy = await navigator.locks.request(
      OWNER_LOCK,
      { ifAvailable: true },
      async (lock) => !lock,
    );
    // The panel itself owns OWNER_LOCK; its message reports active legacy work.
    if (legacy[BACKGROUND] || (ownerBusy && !(await panelAllowsJob()))) {
      job.status = "interrupted";
      job.message =
        "Another writing session owns the document. Pause it, then reschedule.";
      await saveJob(job);
      return;
    }
    const adapter = new GoogleDocsOutputAdapter(extensionGoogleTransport);
    const executor = new AdapterExecutor(adapter, {
      load: async (id) => {
        const d = await chrome.storage.local.get(JOURNAL + id);
        return d[JOURNAL + id]
          ? (JSON.parse(String(d[JOURNAL + id])) as WriteAhead)
          : null;
      },
      save: async (record) => {
        await chrome.storage.local.set({
          [JOURNAL + record.id]: JSON.stringify(record),
        });
      },
    });
    try {
      // Initialize without expected text so a pending committed write can reconcile.
      await adapter.initialize({ documentId: job.documentId });
      const id = `${job.id}:${job.cursor}`;
      const old = await chrome.storage.local.get(JOURNAL + id);
      if (!old[JOURNAL + id] && (await adapter.readText()) !== job.expected)
        throw new Error("Document conflict. Review changes before continuing.");
      if (old[JOURNAL + id]) {
        const saved = JSON.parse(String(old[JOURNAL + id])) as WriteAhead;
        if (
          saved.state === "confirmed" &&
          (await adapter.readText()) !== saved.afterText
        )
          throw new Error("Document changed after checkpoint confirmation.");
      }
      job.status = "running";
      job.lastWake = now;
      await saveJob(job);
      const receipt = await executor.execute(
        id,
        job.checkpoints[job.cursor].operation,
        job.checkpoints[job.cursor].at,
      );
      job.expected = receipt.afterText;
      job.cursor++;
      job.lastWake = Date.now();
      job.message = "Checkpoint verified with Google.";
      if (job.cursor === job.checkpoints.length) {
        job.status = "complete";
        job.message = "Final document exact match verified.";
      }
      await saveJob(job);
      await chrome.action.setBadgeText({
        text: job.status === "complete" ? "✓" : "",
      });
    } catch {
      job.status = "attention";
      job.message =
        "Google connection, quota, or document conflict needs attention. No automatic retry. Reconnect, inspect the document, and reschedule to reconcile.";
      await saveJob(job);
      await chrome.action.setBadgeText({ text: "!" });
    }
  });
}
async function panelAllowsJob() {
  try {
    return (
      (await chrome.runtime.sendMessage({ type: "typeflow-job-idle" })) === true
    );
  } catch {
    return false;
  }
}
export async function controlJob(
  action: "pause" | "cancel" | "resume",
  start?: number,
  end?: number,
) {
  // Serialize controls with remote writes. Stop does not undo an already committed request.
  await navigator.locks.request(JOB_LOCK, async () => {
    const job = await readJob();
    if (!job || ["complete", "cancelled"].includes(job.status)) return;
    if (action === "resume") {
      const minimum = job.checkpoints
        .slice(job.cursor)
        .reduce((total, c) => total + (c.minimumMs ?? 30_000), 0);
      if (
        !start ||
        !end ||
        start < Date.now() ||
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        end - start < minimum
      )
        throw new Error(
          "Choose a longer future recovery window to preserve the remaining checkpoint pacing.",
        );
      const remaining = job.checkpoints.length - job.cursor;
      let at = start;
      const slack = (end - start - minimum) / remaining;
      for (let i = job.cursor; i < job.checkpoints.length; i++) {
        job.checkpoints[i].at = at;
        at += (job.checkpoints[i].minimumMs ?? 30_000) + slack;
      }
      job.stages = [
        {
          name: "Recovered remaining work",
          start,
          end,
          through: job.checkpoints.length,
        },
      ];
      job.status = "scheduled";
      job.lastWake = undefined;
    } else job.status = action === "cancel" ? "cancelled" : "paused";
    await saveJob(job);
  });
}

export async function interruptRunningJob() {
  await navigator.locks.request(JOB_LOCK, async () => {
    const job = await readJob();
    if (job?.status === "running") {
      job.status = "interrupted";
      job.message = "Browser restarted. Review and reschedule remaining work.";
      await saveJob(job);
    }
  });
}
