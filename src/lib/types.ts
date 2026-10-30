export const MAX_TEXT_LENGTH = 100_000;
export type Intensity = "off" | "low" | "medium" | "high";
export type SimulationSettings = { wpm: number; variation: boolean; pauses: Intensity; typos: Intensity; durationSeconds: number | null };
export type Draft = { title: string; text: string; settings: SimulationSettings };
export const DEFAULT_SETTINGS: SimulationSettings = { wpm: 45, variation: true, pauses: "medium", typos: "low", durationSeconds: null };
export const SAMPLE_TEXT = "Every great idea begins with a single word.\n\nSometimes, all it takes is a little space to think. A moment to pause. And the freedom to let your words find their own rhythm.\n\nThis is where your story begins.";
export function wordCount(text: string): number { return text.trim().match(/\S+/gu)?.length ?? 0; }
export function formatTime(ms: number): string { const seconds = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; }
