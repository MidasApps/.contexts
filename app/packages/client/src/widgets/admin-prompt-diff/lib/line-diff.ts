export type DiffLine = { readonly kind: "same" | "added" | "removed"; readonly text: string };

const splitLines = (text: string): string[] => (text === "" ? [] : text.replace(/\r\n?/gu, "\n").split("\n"));

/** `table[i][j]`, or 0 past the edges. */
const cell = (table: readonly number[][], i: number, j: number): number => table[i]?.[j] ?? 0;

/** `table[i][j]` = length of the longest common subsequence of `before[i..]` and `after[j..]`. */
const lcsTable = (before: readonly string[], after: readonly string[]): number[][] => {
  const table = Array.from({ length: before.length + 1 }, () => new Array<number>(after.length + 1).fill(0));
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      const row = table[i];
      if (row === undefined) continue;
      row[j] =
        before[i] === after[j] ? cell(table, i + 1, j + 1) + 1 : Math.max(cell(table, i + 1, j), cell(table, i, j + 1));
    }
  }
  return table;
};

const lineOf = (kind: DiffLine["kind"], lines: readonly string[], index: number): DiffLine => ({
  kind,
  text: lines[index] ?? "",
});

/**
 * Line diff of two texts by longest common subsequence (prompts are at most a few hundred lines,
 * so the quadratic table is fine). Removed lines come before the added ones of the same change.
 * @example diffLines("a\nb", "a\nc") // same a, removed b, added c
 */
export const diffLines = (before: string, after: string): DiffLine[] => {
  const left = splitLines(before);
  const right = splitLines(after);
  const table = lcsTable(left, right);
  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      lines.push(lineOf("same", left, i));
      i += 1;
      j += 1;
    } else if (cell(table, i + 1, j) >= cell(table, i, j + 1)) {
      lines.push(lineOf("removed", left, i));
      i += 1;
    } else {
      lines.push(lineOf("added", right, j));
      j += 1;
    }
  }
  for (; i < left.length; i += 1) lines.push(lineOf("removed", left, i));
  for (; j < right.length; j += 1) lines.push(lineOf("added", right, j));
  return lines;
};

/** How many lines a diff adds and removes. */
export const diffStats = (lines: readonly DiffLine[]): { added: number; removed: number } => ({
  added: lines.filter((line) => line.kind === "added").length,
  removed: lines.filter((line) => line.kind === "removed").length,
});
