// Puzzle loading, line layout, and a no-repeat shuffle bag.

import { shuffle } from "./util.js";

export const ROW_LENGTHS = [12, 14, 14, 12];
export const VOWELS = ["A", "E", "I", "O", "U"];

export const alphaOnly = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

export async function loadPuzzles() {
  const [main, bonus] = await Promise.all([
    fetch("assets/puzzles.json").then((r) => r.json()),
    fetch("assets/bonus_puzzles.json").then((r) => r.json()),
  ]);
  return { main, bonus };
}

// Greedy word wrap across the given per-line budgets.
export function splitIntoLines(puzzleText, budgets) {
  const words = puzzleText.trim().split(/\s+/);
  if (!words.length) return [];
  const lines = [];
  let line = "";
  let i = 0;
  for (const word of words) {
    const budget = budgets[i] ?? 12;
    if (line.length === 0) {
      line = word;
    } else if (line.length + 1 + word.length <= budget) {
      line += " " + word;
    } else {
      lines.push(line);
      line = word;
      i++;
      if (i >= budgets.length) break;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Lay a puzzle onto the 12/14/14/12 grid.
// Returns [{row, col, char, guessable}] plus the rows used.
export function layoutPuzzle(text) {
  const upper = text.toUpperCase();
  const pre = splitIntoLines(upper, ROW_LENGTHS);
  const startRow = pre.length <= 2 ? 1 : 0;
  const lines = splitIntoLines(upper, ROW_LENGTHS.slice(startRow));
  const cells = [];
  lines.forEach((lineText, i) => {
    const row = startRow + i;
    if (row >= 4) return;
    const startCol = Math.floor((ROW_LENGTHS[row] - lineText.length) / 2);
    let col = startCol;
    for (const char of lineText) {
      if (char !== " ") {
        cells.push({
          row,
          col,
          char,
          guessable: /[A-Z0-9]/.test(char),
        });
      }
      col++;
    }
  });
  return cells;
}

// Deals puzzles in random order without repeats until the bank is exhausted.
export class PuzzleBag {
  constructor(puzzles) {
    this.puzzles = puzzles;
    this.order = [];
  }
  next() {
    if (this.order.length === 0) {
      this.order = shuffle([...this.puzzles.keys()]);
    }
    return this.puzzles[this.order.pop()];
  }
}
