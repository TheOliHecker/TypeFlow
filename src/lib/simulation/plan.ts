import {
  MAX_TEXT_LENGTH,
  TYPO_CATEGORIES,
  type SimulationSettings,
  type RevisionMode,
  type ProofreadingSettings,
} from "../types";
import { characters, diffText, type TextChange } from "./diff";
import { randomGenerator, typoGenerator } from "./typos";
import { validateSettings, intensity } from "./settings";
export { advancedSettings, validateSettings } from "./settings";
import { planRevisions } from "./revisions";
import { applyOperation } from "./operations";
import { boundaryPause } from "./rhythm";
import { approvedText } from "./proofreading";

export type Stage = "draft" | "revision" | "proofreading";
export type PlanEvent = {
  scheduledMs: number;
  type: "insert" | "delete" | "thinking" | "stage" | "replace" | "verify";
  text?: string;
  expected?: string;
  operation?: string;
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
  baseWpm: number;
  effectiveWpm: number;
  initialDurationMs: number;
  revisionDurationMs: number;
};
const checkedText = (text: string) => {
  const source = text;
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
  const initialSource = checkedText(input);
  if (!initialSource.trim() && options.finalText === undefined)
    throw new Error("Add a few words before starting your session.");
  const target =
    options.finalText !== undefined
      ? checkedText(options.finalText)
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
    if (
      event.type === "insert" ||
      event.type === "delete" ||
      event.type === "replace"
    )
      typingTime += duration;
    const planned: PlanEvent = {
      ...event,
      stage,
      scheduledMs: time,
      sourceIndex,
    };
    if (
      event.type === "insert" ||
      event.type === "delete" ||
      event.type === "replace"
    )
      planned.typingMs = duration;
    events.push(planned);
    if (event.type === "insert")
      document = applyOperation(document, {
        type: "insert",
        index: event.index!,
        text: event.text ?? "",
      });
    if (event.type === "delete" || event.type === "replace")
      document = applyOperation(document, {
        type: event.type,
        index: event.index!,
        expected: event.expected ?? event.text ?? "",
        text: event.text ?? "",
      });
    if (event.type === "verify")
      applyOperation(document, { type: "verify", expected: event.expected! });
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
    if (sourceIndex < initialSource.length) {
      const pause = boundaryPause(token, settings, a, random);
      if (pause) emit({ type: "thinking" }, pause);
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
    const shortest = pauses + (typing * config.wpm) / 300,
      longest = pauses + (typing * config.wpm) / 20;
    if (longest < 1000)
      throw new Error(
        "This text is too short for a custom duration of at least 1 second.",
      );
    if (requested < shortest - 0.001 || requested > longest + 0.001)
      throw new Error(
        `Choose ${Math.ceil(shortest / 1000)}–${Math.floor(longest / 1000)} seconds to stay within 20–300 WPM with these pauses and corrections.`,
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
  const initialDurationMs = time;
  if (options.finalText !== undefined) {
    currentSettings = options.finalSettings ?? settings;
    a = validateSettings(currentSettings);
    random = randomGenerator(a.seed);
    base = 12000 / currentSettings.wpm;
    const start = time,
      from = events.length;
    typingTime = 0;
    transition("revision");
    let insertionSeed = a.seed;
    const revisions = planRevisions(
      document,
      target,
      options.revisionMode ?? a.revisionStrategy,
    );
    for (const change of revisions) {
      const operation = change.major
        ? `Rewriting ${change.kind}`
        : change.removed && change.inserted
          ? `Replacing ${change.kind}`
          : change.removed
            ? "Removing old passage"
            : "Adding passage";
      // Revision insertions use their own typing and typo preferences, with each
      // slip corrected before continuing to the next supplied change.
      if (intensity[currentSettings.pauses]) {
        emit({ type: "thinking", operation }, base * 0.5);
        time +=
          ((a.sentenceMinMs + random() * (a.sentenceMaxMs - a.sentenceMinMs)) *
            intensity[currentSettings.pauses]) /
          2;
      }
      const behavior = change.major
        ? (a.majorRewrite ?? "insert-first")
        : "delete-first";
      if (behavior === "replace") {
        emit(
          {
            type: "replace",
            index: change.index,
            deleteCount: change.removed.length,
            expected: change.removed,
            text: change.inserted,
            operation,
          },
          base * 1.5,
        );
        continue;
      }
      const insertionIndex =
        change.index +
        (behavior === "insert-first" ? change.removed.length : 0);
      if (behavior === "delete-first") {
        emit({ type: "thinking", operation }, 0);
        // Draft revisions are selected ranges; typo corrections still use their own method.
        if (change.removed)
          emit(
            {
              type: "delete",
              index: change.index,
              text: change.removed,
              deleteCount: change.removed.length,
              operation: "Removing old passage",
            },
            base * 1.5,
          );
      }
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
          if (event.type === "stage" || event.type === "verify") {
            time += delta;
            continue;
          }
          const at =
            event.index === undefined
              ? undefined
              : event.index + insertionIndex;
          const editDelay = event.typingMs ?? delta;
          time += delta - editDelay;
          const savedVariation = currentSettings.variation;
          currentSettings = { ...currentSettings, variation: false };
          emit(
            {
              type: event.type,
              operation,
              text: event.text,
              expected: event.expected,
              index: at,
              deleteCount: event.deleteCount,
              correction: event.correction,
              typoCategory: event.typoCategory,
            },
            editDelay,
          );
          currentSettings = { ...currentSettings, variation: savedVariation };
        }
      } else edit({ ...change, index: insertionIndex, removed: "" });
      if (behavior === "insert-first" && change.removed) {
        emit(
          {
            type: "delete",
            index: change.index,
            text: change.removed,
            deleteCount: change.removed.length,
            operation: "Removing old passage",
          },
          base * 1.5,
        );
      }
    }
    scaleStage(from, start, typingTime, currentSettings);
  }
  let source = target;
  if (options.proofreading?.enabled) {
    source = checkedText(approvedText(target, options.proofreading));
    transition("proofreading");
    emit({ type: "thinking" }, 500);
    for (const change of diffText(document, source)) edit(change);
  }
  if (events.length && time > events[events.length - 1].scheduledMs + 0.001) {
    emit({ type: "thinking" }, 0);
  }
  emit(
    { type: "verify", expected: source, operation: "Reviewing document" },
    0,
  );
  return {
    events,
    durationMs: time,
    source,
    initialSource,
    baseWpm: settings.wpm,
    effectiveWpm: initialDurationMs
      ? characters(initialSource).length / 5 / (initialDurationMs / 60000)
      : 0,
    initialDurationMs,
    revisionDurationMs: time - initialDurationMs,
  };
}
