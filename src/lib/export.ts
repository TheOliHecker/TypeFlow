import type { SessionLog } from "./simulation/engine";
export function safeFilename(title: string): string {
  return title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").replace(/\.+$/g, "").trim().slice(0, 100) || "typeflow-document";
}
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportText(log: SessionLog) { downloadBlob(new Blob([log.source], { type: "text/plain;charset=utf-8" }), `${safeFilename(log.title)}.txt`); }
export function exportLog(log: SessionLog) { downloadBlob(new Blob([JSON.stringify(log, null, 2)], { type: "application/json" }), `${safeFilename(log.title)}.automated-simulation.json`); }
export async function createDocx(log: SessionLog): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun } = await import("docx");
  const document = new Document({
    title: log.title,
    creator: "TypeFlow · Automated simulation",
    description: log.authorshipNotice,
    sections: [{ children: log.source.split("\n").map(line => new Paragraph({ children: [new TextRun({ text: line, font: "Calibri", size: 24 })], spacing: { after: 0, before: 0 } })) }],
  });
  return Packer.toBlob(document);
}
