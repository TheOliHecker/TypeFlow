import {
  AdapterExecutor,
  PreviewAdapter,
  type WriteAhead,
} from "../simulation/adapters";
export const FAILURES = [
  "Network interruption",
  "HTTP 429",
  "HTTP 401",
  "HTTP 403",
  "API timeout",
  "Expired authentication",
  "Interrupted session",
  "Uncertain write outcome",
  "Concurrent changes",
];
/** Entirely local adapter. No Google transport is constructed. */
export async function exerciseFailure(failure: string) {
  let journal: WriteAhead | null = null;
  class FaultAdapter extends PreviewAdapter {
    override async execute(
      ...args: Parameters<PreviewAdapter["execute"]>
    ): ReturnType<PreviewAdapter["execute"]> {
      if (
        [
          "Uncertain write outcome",
          "API timeout",
          "Concurrent changes",
        ].includes(failure)
      ) {
        await super.execute(...args);
        if (failure === "Concurrent changes")
          await this.apply({
            type: "insert",
            index: 0,
            text: "External edit ",
          });
      }
      throw new Error(
        `${failure}: locally injected; no Google request was sent.`,
      );
    }
  }
  const adapter = new FaultAdapter();
  await adapter.initialize({ text: "Automated local sample" });
  const executor = new AdapterExecutor(adapter, {
    load: async () => journal,
    save: async (r) => {
      journal = r;
    },
  });
  let error = "";
  try {
    await executor.execute(
      "local-failure",
      { type: "insert", index: 22, text: "." },
      Date.now(),
    );
  } catch (e) {
    error = (e as Error).message;
  }
  let reconciled = "No journal";
  if (journal) {
    try {
      reconciled = (await executor.reconcile(journal)).state;
    } catch {
      reconciled =
        "Conflict: manual inspection required; no overwrite attempted";
    }
  }
  return {
    mode: "Local fault injection — no API calls",
    failure,
    error,
    pendingState: (journal as WriteAhead | null)?.state,
    reconciliation: reconciled,
    finalText: await adapter.readText(),
  };
}
