import {
  DEFAULT_ADVANCED,
  TYPO_CATEGORIES,
  type SimulationSettings,
  type AdvancedSettings,
} from "../types";
export const intensity = { off: 0, low: 1, medium: 2, high: 3 };
export function advancedSettings(
  settings: SimulationSettings,
): AdvancedSettings {
  return {
    ...DEFAULT_ADVANCED,
    ...settings.advanced,
    categories: {
      ...DEFAULT_ADVANCED.categories,
      ...settings.advanced?.categories,
    },
    probabilities: {
      ...DEFAULT_ADVANCED.probabilities,
      ...settings.advanced?.probabilities,
    },
  };
}
export function validateSettings(settings: SimulationSettings) {
  if (!Number.isFinite(settings.wpm) || settings.wpm < 20 || settings.wpm > 300)
    throw new Error("Typing speed must be between 20 and 300 WPM.");
  if (
    !Object.hasOwn(intensity, settings.pauses) ||
    !Object.hasOwn(intensity, settings.typos)
  )
    throw new Error("Choose a valid pause and correction intensity.");
  const a = advancedSettings(settings);
  for (const [min, max] of [
    [a.sentenceMinMs, a.sentenceMaxMs],
    [a.paragraphMinMs, a.paragraphMaxMs],
  ]) {
    if (
      !Number.isFinite(min) ||
      !Number.isFinite(max) ||
      min < 0 ||
      max < min ||
      max > 600000
    )
      throw new Error(
        "Pause ranges must be ordered and between 0 and 600000 milliseconds.",
      );
  }
  if (
    !Number.isInteger(a.seed) ||
    !Number.isFinite(a.variationPercent) ||
    a.variationPercent < 0 ||
    a.variationPercent > 90
  )
    throw new Error(
      "Use an integer seed and speed variation between 0 and 90%.",
    );
  if (
    a.typoProbability !== null &&
    (!Number.isFinite(a.typoProbability) ||
      a.typoProbability < 0 ||
      a.typoProbability > 1)
  )
    throw new Error("Typo probability must be between 0 and 100%.");
  if (
    !["immediate", "word", "sentence", "proofreading"].includes(
      a.correctionTiming,
    ) ||
    !["backspace", "replace"].includes(a.correctionMethod)
  )
    throw new Error("Choose valid correction preferences.");
  if (
    !["smart", "targeted", "paragraph", "full"].includes(
      a.revisionStrategy ?? "smart",
    ) ||
    !["delete-first", "insert-first", "replace"].includes(
      a.majorRewrite ?? "delete-first",
    )
  )
    throw new Error("Choose valid revision preferences.");
  for (const category of TYPO_CATEGORIES)
    if (
      typeof a.categories[category] !== "boolean" ||
      !Number.isFinite(a.probabilities[category]) ||
      a.probabilities[category] < 0 ||
      a.probabilities[category] > 100
    )
      throw new Error("Typo category weights must be between 0 and 100.");
  return a;
}
