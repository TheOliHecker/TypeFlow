"use client";
import { useEffect, useReducer, useRef, useState } from "react";
import {
  DEFAULT_SETTINGS,
  DEFAULT_PROOFREADING,
  MAX_TEXT_LENGTH,
  SAMPLE_TEXT,
  type Draft,
  type SimulationSettings,
} from "./types";
import { validateSettings } from "./simulation/plan";
const initial: Draft = {
  title: "A little room to think",
  text: SAMPLE_TEXT,
  settings: DEFAULT_SETTINGS,
  mode: "single",
  finalText: "",
  finalSettings: DEFAULT_SETTINGS,
  revisionMode: "targeted",
  proofreading: DEFAULT_PROOFREADING,
};
type State = { draft: Draft; loaded: boolean };
type Action =
  | { type: "load"; draft: Draft }
  | { type: "update"; value: Partial<Draft> };
const intensities = ["off", "low", "medium", "high"];
export function validateDraft(value: unknown): Draft {
  if (!value || typeof value !== "object") return initial;
  const d = value as Partial<Draft>;
  const s = d.settings as Partial<SimulationSettings> | undefined;
  let advanced: SimulationSettings["advanced"];
  try {
    if (s?.advanced)
      advanced = validateSettings({
        ...DEFAULT_SETTINGS,
        advanced: s.advanced,
      });
  } catch {}
  return {
    title: typeof d.title === "string" ? d.title.slice(0, 120) : initial.title,
    text:
      typeof d.text === "string"
        ? d.text.slice(0, MAX_TEXT_LENGTH).replace(/\r\n?/g, "\n")
        : initial.text,
    mode: d.mode === "two" ? "two" : "single",
    finalText:
      typeof d.finalText === "string"
        ? d.finalText.slice(0, MAX_TEXT_LENGTH).replace(/\r\n?/g, "\n")
        : "",
    finalSettings: d.finalSettings
      ? validateDraft({ settings: d.finalSettings }).settings
      : DEFAULT_SETTINGS,
    revisionMode: ["targeted", "paragraph", "full"].includes(
      d.revisionMode ?? "",
    )
      ? d.revisionMode
      : "targeted",
    proofreading: {
      ...DEFAULT_PROOFREADING,
      ...Object.fromEntries(
        Object.keys(DEFAULT_PROOFREADING)
          .filter((key) => key !== "approvedIds")
          .map((key) => [
            key,
            typeof d.proofreading?.[
              key as keyof typeof DEFAULT_PROOFREADING
            ] === "boolean"
              ? d.proofreading[key as keyof typeof DEFAULT_PROOFREADING]
              : DEFAULT_PROOFREADING[key as keyof typeof DEFAULT_PROOFREADING],
          ]),
      ),
      approvedIds: Array.isArray(d.proofreading?.approvedIds)
        ? d.proofreading.approvedIds.filter(
            (id): id is string => typeof id === "string",
          )
        : [],
    },
    settings: {
      advanced,
      wpm:
        typeof s?.wpm === "number" && Number.isFinite(s.wpm)
          ? Math.min(200, Math.max(20, s.wpm))
          : 45,
      variation: typeof s?.variation === "boolean" ? s.variation : true,
      pauses: s?.pauses && intensities.includes(s.pauses) ? s.pauses : "medium",
      typos: s?.typos && intensities.includes(s.typos) ? s.typos : "low",
      durationSeconds:
        typeof s?.durationSeconds === "number" &&
        Number.isFinite(s.durationSeconds) &&
        s.durationSeconds > 0 &&
        s.durationSeconds <= 604800
          ? s.durationSeconds
          : null,
    },
  };
}
export function useDraft() {
  const [state, dispatch] = useReducer(
    (state: State, action: Action): State =>
      action.type === "load"
        ? { draft: action.draft, loaded: true }
        : { ...state, draft: { ...state.draft, ...action.value } },
    { draft: initial, loaded: false },
  );
  const [storageError, setStorageError] = useState(false);
  const [savedDraft, setSavedDraft] = useState(initial);
  const latestDraft = useRef(state.draft);
  useEffect(() => {
    latestDraft.current = state.draft;
  }, [state.draft]);
  useEffect(() => {
    let draft = initial;
    try {
      const saved = localStorage.getItem("typeflow-draft-v1");
      if (saved) draft = validateDraft(JSON.parse(saved));
    } catch {}
    dispatch({ type: "load", draft });
  }, []);
  useEffect(() => {
    if (!state.loaded) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem("typeflow-draft-v1", JSON.stringify(state.draft));
        setSavedDraft(state.draft);
        setStorageError(false);
      } catch {
        setStorageError(true);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [state]);
  // Flush a debounced draft when navigating away or refreshing.
  useEffect(() => {
    if (!state.loaded) return;
    const save = () => {
      try {
        localStorage.setItem(
          "typeflow-draft-v1",
          JSON.stringify(latestDraft.current),
        );
      } catch {}
    };
    window.addEventListener("pagehide", save);
    return () => {
      save();
      window.removeEventListener("pagehide", save);
    };
  }, [state.loaded]);
  return {
    ...state,
    storageError,
    saving: state.loaded && savedDraft !== state.draft,
    update: (value: Partial<Draft>) => {
      latestDraft.current = { ...state.draft, ...value };
      dispatch({ type: "update", value });
    },
  };
}
