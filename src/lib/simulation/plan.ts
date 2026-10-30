import {
  DEFAULT_ADVANCED,
  MAX_TEXT_LENGTH,
  TYPO_CATEGORIES,
  type SimulationSettings,
  type AdvancedSettings,
  type RevisionMode,
  type ProofreadingSettings,
} from "../types";
import { characters, diffText, type TextChange } from "./diff";
import { randomGenerator, typoGenerator } from "./typos";
import { approvedText } from "./proofreading";

export type Stage = "draft" | "revision" | "proofreading";
export type PlanEvent = {
  scheduledMs: number;
  type: "insert" | "delete" | "thinking" | "stage";
  text?: string;
  sourceIndex: number;
  /** Time spent on the edit itself, excluding thinking pauses. */
  typingMs?: number;
  /** Zero-based UTF-16 offset in the document immediately before this event. */
  index?: number;
  deleteCount?: number;
  correction?: boolean;
  typoCategory?: (typeof TYPO_CATEGORIES)[number];
  stage?: Stage;
};
export type SessionOptions = {
  finalText?: string;
  finalSettings?: SimulationSettings;
  revisionMode?: RevisionMode;
  proofreading?: ProofreadingSettings;
};
export type SimulationPlan = {
  events: PlanEvent[];
  durationMs: number;
  source: string;
  initialSource: string;
  effectiveWpm: number;
};
const intensity = { off: 0, low: 1, medium: 2, high: 3 };
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
  if (!Number.isFinite(settings.wpm) || settings.wpm < 20 || settings.wpm > 200)
    throw new Error("Typing speed must be between 20 and 200 WPM.");
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
const normalize = (text: string) => {
  const source = text.replace(/\r\n?/g, "\n");
  if (source.length > MAX_TEXT_LENGTH)
    throw new Error(
      `Documents are limited to ${MAX_TEXT_LENGTH.toLocaleString()} characters.`,
    );
  return source;
};

/** A single deterministic schedule drives both estimates and execution. */
export function createPlan(
  input: string,
  settings: SimulationSettings,
  seed?: number,
  options: SessionOptions = {},
): SimulationPlan {
  const initialSource = normalize(input);
  if (!initialSource.trim())
    throw new Error("Add a few words before starting your session.");
  const target = options.finalText?.trim()
    ? normalize(options.finalText)
    : initialSource;
  const events: PlanEvent[] = [];
  let time = 0,
    document = "",
    sourceIndex = 0;
  let currentSettings = settings,
    a = validateSettings(settings),
    random = randomGenerator(seed ?? a.seed);
  let base = 12000 / settings.wpm;
  let stage: Stage = "draft";
  let typingTime = 0;
  const emit = (
    event: Omit<PlanEvent, "scheduledMs" | "sourceIndex" | "stage">,
    delay = base,
  ) => {
    const duration =
      delay *
      (currentSettings.variation
        ? 1 + ((random() * 2 - 1) * a.variationPercent) / 100
        : 1);
    time += duration;
    if (event.type === "insert" || event.type === "delete")
      typingTime += duration;
    const planned: PlanEvent = {
      ...event,
      stage,
      scheduledMs: time,
      sourceIndex,
    };
    if (event.type === "insert" || event.type === "delete")
      planned.typingMs = duration;
    events.push(planned);
    if (event.type === "insert")
      document =
        document.slice(0, event.index!) +
        event.text +
        document.slice(event.index!);
    if (event.type === "delete")
      document =
        document.slice(0, event.index!) +
        document.slice(event.index! + event.deleteCount!);
  };
  const edit = (change: TextChange, correction = false) => {
    if (change.removed) {
      if (a.correctionMethod === "replace")
        emit(
          {
            type: "delete",
            index: change.index,
            deleteCount: change.removed.length,
            text: change.removed,
            correction,
          },
          base * 1.5,
        );
      else {
        let end = change.index + change.removed.length;
        for (const char of characters(change.removed).reverse()) {
          end -= char.length;
          emit(
            {
              type: "delete",
              index: end,
              deleteCount: char.length,
              text: char,
              correction,
            },
            base * 0.65,
          );
        }
      }
    }
    let at = change.index;
    for (const char of characters(change.inserted)) {
      emit({ type: "insert", index: at, text: char, correction });
      at += char.length;
    }
  };
  const transition = (next: Stage) => {
    stage = next;
    emit({ type: "stage" }, 0);
  };
  const begin = events.length;

  const typo = typoGenerator(random, a);
  const pending: { index: number; wrong: string; correct: string }[] = [];
  const flush = () => {
    for (const p of pending.reverse()) {
      for (const c of diffText(p.wrong, p.correct))
        edit({ ...c, index: c.index + p.index }, true);
    }
    pending.length = 0;
  };
  const tokens: string[] = [];
  let previousWord = false;
  for (const char of characters(initialSource)) {
    const word = /^[\p{L}\p{M}]+$/u.test(char);
    if (tokens.length && previousWord === word)
      tokens[tokens.length - 1] += char;
    else tokens.push(char);
    previousWord = word;
  }
  for (const token of tokens) {
    const chance = a.typoProbability ?? intensity[settings.typos] * 0.08;
    const mistake =
      settings.typos !== "off" && random() < chance ? typo(token) : null;
    const at = document.length;
    if (mistake && a.correctionTiming === "immediate") {
      const change = diffText(token, mistake.text)[0];
      const prefix = token.slice(0, change.index);
      for (const char of characters(prefix)) {
        sourceIndex += char.length;
        emit({ type: "insert", index: document.length, text: char });
      }
      for (const char of characters(change.inserted))
        emit({
          type: "insert",
          index: document.length,
          text: char,
          correction: true,
          typoCategory: mistake.category,
        });
      if (!change.inserted)
        emit(
          {
            type: "thinking",
            correction: true,
            typoCategory: mistake.category,
          },
          base * 0.7,
        );
      sourceIndex += change.removed.length;
      edit(
        {
          index: at + change.index,
          removed: change.inserted,
          inserted: change.removed,
        },
        true,
      );
      for (const char of characters(
        token.slice(change.index + change.removed.length),
      )) {
        sourceIndex += char.length;
        emit({ type: "insert", index: document.length, text: char });
      }
    } else {
      for (const char of characters(mistake?.text ?? token)) {
        if (!mistake) sourceIndex += char.length;
        emit({
          type: "insert",
          index: document.length,
          text: char,
          ...(mistake
            ? { correction: true, typoCategory: mistake.category }
            : {}),
        });
      }
      if (mistake) {
        sourceIndex += token.length;
        pending.push({ index: at, wrong: mistake.text, correct: token });
      }
      if (a.correctionTiming === "word") flush();
    }
    if (/[.!?\n]/u.test(token) && a.correctionTiming === "sentence") flush();
    if (intensity[settings.pauses] && sourceIndex < initialSource.length) {
      for (const boundary of token.match(/\n\n+|[.!?](?:\s|$)/gu) ?? []) {
        const paragraph = boundary.startsWith("\n");
        const min = paragraph ? a.paragraphMinMs : a.sentenceMinMs;
        const max = paragraph ? a.paragraphMaxMs : a.sentenceMaxMs;
        emit({ type: "thinking" }, base * 0.5);
        time +=
          ((min + random() * (max - min)) * intensity[settings.pauses]) / 2;
        if (a.longerBreaks && random() < 0.15) time += 5000 + random() * 10000;
      }
    }
  }
  if (pending.length) {
    if (a.correctionTiming === "proofreading") transition("proofreading");
    flush();
  }
  const scaleStage = (
    from: number,
    stageStart: number,
    typing: number,
    config: SimulationSettings,
  ) => {
    if (config.durationSeconds === null) return;
    const requested = config.durationSeconds * 1000,
      duration = time - stageStart;
    if (
      !Number.isFinite(requested) ||
      requested < 1000 ||
      requested > 604800000
    )
      throw new Error("Custom duration must be between 1 second and 7 days.");
    const pauses = duration - typing;
    const shortest = pauses + (typing * config.wpm) / 200,
      longest = pauses + (typing * config.wpm) / 20;
    if (longest < 1000)
      throw new Error(
        "This text is too short for a custom duration of at least 1 second.",
      );
    if (requested < shortest - 0.001 || requested > longest + 0.001)
      throw new Error(
        `Choose ${Math.ceil(shortest / 1000)}–${Math.floor(longest / 1000)} seconds to stay within 20–200 WPM with these pauses and corrections.`,
      );
    const factor = typing ? (requested - pauses) / typing : 1;
    let previous = stageStart,
      adjusted = stageStart;
    for (let i = from; i < events.length; i++) {
      const e = events[i],
        delta = e.scheduledMs - previous;
      previous = e.scheduledMs;
      const editDuration = e.typingMs ?? 0;
      adjusted += delta - editDuration + editDuration * factor;
      e.scheduledMs = adjusted;
      if (e.typingMs !== undefined) e.typingMs *= factor;
    }
    time = stageStart + requested;
  };
  scaleStage(begin, 0, typingTime, settings);
  if (target !== initialSource) {
    currentSettings = options.finalSettings ?? settings;
    a = validateSettings(currentSettings);
    random = randomGenerator(a.seed);
    base = 12000 / currentSettings.wpm;
    const start = time,
      from = events.length;
    typingTime = 0;
    transition("revision");
    let insertionSeed = a.seed;
    for (const change of diffText(document, target, options.revisionMode)) {
      // Revision insertions use their own typing and typo preferences, with each
      // slip corrected before continuing to the next supplied change.
      if (intensity[currentSettings.pauses]) {
        emit({ type: "thinking" }, base * 0.5);
        time +=
          ((a.sentenceMinMs + random() * (a.sentenceMaxMs - a.sentenceMinMs)) *
            intensity[currentSettings.pauses]) /
          2;
      }
      edit({ ...change, inserted: "" });
      if (change.inserted.trim()) {
        const insertion = createPlan(
          change.inserted,
          { ...currentSettings, durationSeconds: null },
          insertionSeed++,
        );
        let previous = 0;
        for (const event of insertion.events) {
          const delta = event.scheduledMs - previous;
          previous = event.scheduledMs;
          // Nested stage markers never replace the outer revision stage.
          if (event.type === "stage") {
            time += delta;
            continue;
          }
          const at =
            event.index === undefined ? undefined : event.index + change.index;
          const editDelay = event.typingMs ?? delta;
          time += delta - editDelay;
          const savedVariation = currentSettings.variation;
          currentSettings = { ...currentSettings, variation: false };
          emit(
            {
              type: event.type,
              text: event.text,
              index: at,
              deleteCount: event.deleteCount,
              correction: event.correction,
              typoCategory: event.typoCategory,
            },
            editDelay,
          );
          currentSettings = { ...currentSettings, variation: savedVariation };
        }
      } else edit({ ...change, removed: "" });
    }
    scaleStage(from, start, typingTime, currentSettings);
  }
  let source = target;
  if (options.proofreading?.enabled) {
    source = normalize(approvedText(target, options.proofreading));
    transition("proofreading");
    emit({ type: "thinking" }, 500);
    for (const change of diffText(document, source)) edit(change);
  }
  if (events.length && time > events[events.length - 1].scheduledMs + 0.001) {
    emit({ type: "thinking" }, 0);
  }
  return {
    events,
    durationMs: time,
    source,
    initialSource,
    effectiveWpm: settings.wpm,
  };
}
