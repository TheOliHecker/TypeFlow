import type { AdvancedSettings, SimulationSettings } from "../types";
import { intensity } from "./settings";
/** Customizable simulation choices, not universal claims about human behavior. */
export function boundaryPause(
  token: string,
  settings: SimulationSettings,
  a: AdvancedSettings,
  random: () => number,
): number {
  const level = intensity[settings.pauses];
  if (!level) return 0;
  let min = 0,
    max = 0;
  if (/\n/u.test(token)) {
    min = a.paragraphMinMs;
    max = a.paragraphMaxMs;
  } else if (/[.!?](?:["'”’)]*\s|$)/u.test(token)) {
    min = a.sentenceMinMs;
    max = a.sentenceMaxMs;
  } else if (/[,;:]/u.test(token)) {
    min = a.sentenceMinMs * 0.15;
    max = a.sentenceMaxMs * 0.3;
  } else if (/\s/u.test(token)) {
    min = 20;
    max = 100;
  }
  let pause = ((min + random() * (max - min)) * level) / 2;
  if (pause && a.longerBreaks && random() < 0.015)
    pause += 5000 + random() * 10000;
  return pause;
}
