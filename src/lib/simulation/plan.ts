import { MAX_TEXT_LENGTH, type SimulationSettings } from "../types";

export type PlanEvent = {
  scheduledMs: number;
  type: "insert" | "delete" | "thinking";
  text?: string;
  sourceIndex: number;
  correction?: boolean;
};
export type SimulationPlan = { events: PlanEvent[]; durationMs: number; source: string; effectiveWpm: number };
const intensity = { off: 0, low: 1, medium: 2, high: 3 };

/** A seeded PRNG keeps the estimate and the actual schedule identical. */
function randomGenerator(seed: number) {
  return () => { seed |= 0; seed = seed + 0x6d2b79f5 | 0; let n = Math.imul(seed ^ seed >>> 15, 1 | seed); n = n + Math.imul(n ^ n >>> 7, 61 | n) ^ n; return ((n ^ n >>> 14) >>> 0) / 4294967296; };
}
export function createPlan(input: string, settings: SimulationSettings, seed = 42): SimulationPlan {
  const source = input.replace(/\r\n?/g, "\n");
  if (!source.trim()) throw new Error("Add a few words before starting your session.");
  if (source.length > MAX_TEXT_LENGTH) throw new Error(`Documents are limited to ${MAX_TEXT_LENGTH.toLocaleString()} characters.`);
  if (!Number.isFinite(settings.wpm) || settings.wpm < 20 || settings.wpm > 120) throw new Error("Typing speed must be between 20 and 120 WPM.");
  if (!(settings.pauses in intensity) || !(settings.typos in intensity)) throw new Error("Choose a valid pause and correction intensity.");
  const random = randomGenerator(seed);
  const base = 60000 / (settings.wpm * 5);
  const events: PlanEvent[] = [];
  let scheduledMs = 0;
  let sourceIndex = 0;
  for (const character of source) {
    scheduledMs += base * (settings.variation ? 0.65 + random() * 0.7 : 1);
    if (/[a-z]/i.test(character) && random() < intensity[settings.typos] * 0.018) {
      events.push({ type: "insert", text: character === "x" ? "z" : "x", scheduledMs, sourceIndex, correction: true });
      scheduledMs += base * (1.5 + random());
      events.push({ type: "delete", scheduledMs, sourceIndex, correction: true });
      scheduledMs += base * 0.7;
    }
    sourceIndex += character.length;
    events.push({ type: "insert", text: character, scheduledMs, sourceIndex });
    if (sourceIndex < source.length && intensity[settings.pauses] && /[.!?\n]/.test(character)) {
      scheduledMs += base * 0.5;
      events.push({ type: "thinking", scheduledMs, sourceIndex });
      scheduledMs += base * intensity[settings.pauses] * (3 + random() * 4);
    }
  }
  let effectiveWpm = settings.wpm;
  if (settings.durationSeconds !== null) {
    const requested = settings.durationSeconds * 1000;
    if (!Number.isFinite(requested) || requested <= 0 || requested > 604800000) throw new Error("Custom duration must be between 1 second and 7 days.");
    const shortest = scheduledMs * settings.wpm / 120;
    const longest = scheduledMs * settings.wpm / 20;
    if (requested < shortest - 0.001 || requested > longest + 0.001) {
      throw new Error(`With these pauses and corrections, choose ${Math.ceil(shortest / 1000)}–${Math.floor(longest / 1000)} seconds to stay within 20–120 WPM. Try Automatic or change the settings.`);
    }
    const scale = requested / scheduledMs;
    effectiveWpm = settings.wpm / scale;
    for (const event of events) event.scheduledMs *= scale;
    scheduledMs = requested;
  }
  return { events, durationMs: scheduledMs, source, effectiveWpm };
}
