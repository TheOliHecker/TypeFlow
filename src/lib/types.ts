export const MAX_TEXT_LENGTH = 100_000;
export type Intensity = "off" | "low" | "medium" | "high";
export const TYPO_CATEGORIES = [
  "nearby",
  "missing",
  "repeated",
  "transposed",
  "additional",
  "spelling",
  "capitalization",
  "punctuation",
] as const;
export type TypoCategory = (typeof TYPO_CATEGORIES)[number];
export type CorrectionTiming =
  | "immediate"
  | "word"
  | "sentence"
  | "proofreading";
export type RevisionMode = "smart" | "targeted" | "paragraph" | "full";
export type AdvancedSettings = {
  revisionStrategy?: RevisionMode;
  majorRewrite?: "delete-first" | "insert-first" | "replace";
  categories: Record<TypoCategory, boolean>;
  probabilities: Record<TypoCategory, number>;
  typoProbability: number | null;
  correctionTiming: CorrectionTiming;
  correctionMethod: "backspace" | "replace";
  sentenceMinMs: number;
  sentenceMaxMs: number;
  paragraphMinMs: number;
  paragraphMaxMs: number;
  longerBreaks: boolean;
  variationPercent: number;
  seed: number;
};
export const DEFAULT_ADVANCED: AdvancedSettings = {
  revisionStrategy: "smart",
  majorRewrite: "delete-first",
  categories: {
    nearby: true,
    missing: true,
    repeated: true,
    transposed: true,
    additional: true,
    spelling: true,
    capitalization: true,
    punctuation: false,
  },
  probabilities: {
    nearby: 35,
    missing: 20,
    repeated: 15,
    transposed: 15,
    additional: 10,
    spelling: 5,
    capitalization: 8,
    punctuation: 5,
  },
  typoProbability: null,
  correctionTiming: "word",
  correctionMethod: "backspace",
  sentenceMinMs: 500,
  sentenceMaxMs: 1500,
  paragraphMinMs: 1200,
  paragraphMaxMs: 3000,
  longerBreaks: false,
  variationPercent: 35,
  seed: 42,
};
export type ProofreadingSettings = {
  enabled: boolean;
  spelling: boolean;
  grammar: boolean;
  punctuation: boolean;
  style: boolean;
  approvedIds: string[];
};
export const DEFAULT_PROOFREADING: ProofreadingSettings = {
  enabled: false,
  spelling: true,
  grammar: true,
  punctuation: true,
  style: false,
  approvedIds: [],
};
export type SimulationSettings = {
  wpm: number;
  variation: boolean;
  pauses: Intensity;
  typos: Intensity;
  durationSeconds: number | null;
  advanced?: AdvancedSettings;
};
export type Draft = {
  title: string;
  text: string;
  settings: SimulationSettings;
  mode?: "single" | "two";
  finalText?: string;
  finalSettings?: SimulationSettings;
  revisionMode?: RevisionMode;
  proofreading?: ProofreadingSettings;
};
export const DEFAULT_SETTINGS: SimulationSettings = {
  wpm: 45,
  variation: true,
  pauses: "medium",
  typos: "low",
  durationSeconds: null,
};
export const SAMPLE_TEXT =
  "Every great idea begins with a single word.\n\nSometimes, all it takes is a little space to think. A moment to pause. And the freedom to let your words find their own rhythm.\n\nThis is where your story begins.";
export function wordCount(text: string): number {
  return text.trim().match(/\S+/gu)?.length ?? 0;
}
export function completedWordCount(text: string, sourceIndex: number): number {
  if (sourceIndex >= text.length) return wordCount(text);
  return wordCount(text.slice(0, sourceIndex).replace(/\S+$/u, ""));
}
export function formatTime(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
