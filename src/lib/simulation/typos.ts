import {
  TYPO_CATEGORIES,
  type AdvancedSettings,
  type TypoCategory,
} from "../types";
const rows = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const keys = rows.flatMap((row, y) =>
  [...row].map((key, x) => ({ key, x: x + [0, 0.25, 0.75][y], y })),
);
const slips: Record<string, string> = {
  the: "teh",
  their: "thier",
  receive: "recieve",
  because: "becuase",
  separate: "seperate",
  definitely: "definately",
  great: "graet",
  writing: "writting",
  believe: "beleive",
  friend: "freind",
};
export const SPELLING_CORRECTIONS = Object.fromEntries(
  Object.entries(slips).map(([a, b]) => [b, a]),
);
export function randomGenerator(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let n = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    n = (n + Math.imul(n ^ (n >>> 7), 61 | n)) ^ n;
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}
/** Weighted physical neighbors; repeat avoidance lasts for one planning session. */
export function typoGenerator(
  random: () => number,
  settings: AdvancedSettings,
) {
  const recent: string[] = [];
  return (word: string): { text: string; category: TypoCategory } | null => {
    if (!/^[a-z]+$/i.test(word) || word.length < 2) return null;
    const choices = TYPO_CATEGORIES.filter(
      (c) =>
        settings.categories[c] &&
        settings.probabilities[c] > 0 &&
        (c !== "spelling" || slips[word.toLowerCase()]),
    );
    if (!choices.length) return null;
    const total = choices.reduce(
      (sum, c) => sum + settings.probabilities[c],
      0,
    );
    for (let attempt = 0; attempt < 8; attempt++) {
      let weight = random() * total;
      const category =
        choices.find((c) => (weight -= settings.probabilities[c]) < 0) ??
        choices[0];
      // Interior letters are more error prone than the first letter.
      const i = Math.min(
        word.length - 1,
        Math.floor((0.15 + random() * 0.85) * word.length),
      );
      const letter = word[i];
      const key = keys.find((k) => k.key === letter.toLowerCase())!;
      const neighbors = keys.filter(
        (k) => k !== key && Math.hypot(k.x - key.x, k.y - key.y) < 1.6,
      );
      const weighted = neighbors.flatMap((k) =>
        Array.from(
          { length: Math.round(5 / Math.hypot(k.x - key.x, k.y - key.y)) },
          () => k.key,
        ),
      );
      let neighbor = weighted[Math.floor(random() * weighted.length)];
      if (letter === letter.toUpperCase()) neighbor = neighbor.toUpperCase();
      let text = word;
      if (category === "nearby")
        text = word.slice(0, i) + neighbor + word.slice(i + 1);
      if (category === "missing") text = word.slice(0, i) + word.slice(i + 1);
      if (category === "repeated")
        text = word.slice(0, i) + letter + word.slice(i);
      if (category === "additional")
        text = word.slice(0, i) + neighbor + word.slice(i);
      if (category === "transposed") {
        const j = Math.min(i, word.length - 2);
        text = word.slice(0, j) + word[j + 1] + word[j] + word.slice(j + 2);
      }
      if (category === "spelling") {
        text = slips[word.toLowerCase()];
        if (/^[A-Z]/.test(word)) text = text[0].toUpperCase() + text.slice(1);
      }
      if (category === "capitalization")
        text =
          word.slice(0, i) +
          (letter === letter.toLowerCase()
            ? letter.toUpperCase()
            : letter.toLowerCase()) +
          word.slice(i + 1);
      if (category === "punctuation")
        text = word + [",", ".", "’"][Math.floor(random() * 3)];
      const signature =
        category +
        ":" +
        (category === "nearby" || category === "additional" ? neighbor : text);
      if (text !== word && !recent.includes(signature)) {
        recent.push(signature);
        if (recent.length > 3) recent.shift();
        return { text, category };
      }
    }
    return null;
  };
}
