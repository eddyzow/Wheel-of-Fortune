// Game modes: Classic, Full Game, Endless Toss-Up, Triple Toss-Up, Bonus.
// Each mode is an async function driven by an awaitable input queue.

import { delay, rand, shuffle, fmtMoney, levenshtein } from "./util.js";
import { alphaOnly, layoutPuzzle, VOWELS } from "./puzzles.js";
import * as ui from "./ui.js";
import * as fx from "./fx.js";
import {
  SFX,
  playTossupMusic,
  stopTossupMusic,
  stopAllMusic,
} from "./audio.js";

const VOWEL_COST = 250;
const GIVEN_LETTERS = ["R", "S", "T", "L", "N", "E"];

export class AbortGame extends Error {
  constructor() {
    super("game aborted");
    this.name = "AbortGame";
  }
}

// Awaitable keyboard/button input.
export class Input {
  constructor() {
    this.resolver = null;
    this.rejecter = null;
    this.aborted = false;
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      if (ui.solveBarVisible()) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === "Space") e.preventDefault();
      this.push({ type: "key", key: e.key.toUpperCase(), code: e.code });
    });
  }
  push(action) {
    const r = this.resolver;
    if (r) {
      this.resolver = null;
      this.rejecter = null;
      r(action);
    }
  }
  next() {
    if (this.aborted) throw new AbortGame();
    return new Promise((res, rej) => {
      this.resolver = res;
      this.rejecter = rej;
    });
  }
  abort() {
    this.aborted = true;
    const rej = this.rejecter;
    this.resolver = null;
    this.rejecter = null;
    rej?.(new AbortGame());
  }
  reset() {
    this.aborted = false;
  }
}

export class Game {
  constructor({ board, wheel, input, bags }) {
    this.board = board;
    this.wheel = wheel;
    this.input = input;
    this.bags = bags;
    this.score = 0;
    this.usedLetters = new Set();
  }

  check() {
    if (this.input.aborted) throw new AbortGame();
  }

  log(...args) {
    (window.__woflog = window.__woflog || []).push(
      [(performance.now() / 1000).toFixed(1), ...args].join(" ")
    );
  }

  setScore(n, flash = true) {
    this.score = n;
    ui.setScore(n);
    if (flash) ui.flashScore();
  }

  async sleep(ms) {
    await delay(ms);
    this.check();
  }

  newPuzzle(bag = "main") {
    const p = this.bags[bag].next();
    this.usedLetters = new Set();
    ui.resetTracker();
    return p;
  }

  markUsed(letter) {
    this.usedLetters.add(letter);
    ui.markLetterUsed(letter);
  }

  async loadBoard(puzzle) {
    this.currentPuzzle = puzzle;
    this.board.reset();
    ui.setCategory(puzzle.category);
    this.cells = layoutPuzzle(puzzle.puzzle);
    SFX.sparkle.play();
    await this.board.setPuzzle(this.cells);
    this.check();
  }

  cellsFor(letter) {
    return this.cells.filter(
      (c) => c.char === letter && this.board.tileAt(c.row, c.col)?.state === "blank"
    );
  }

  async revealAllRemaining({ shuffled = false, interval = 180 } = {}) {
    let remaining = this.board.unrevealedCells();
    if (shuffled) remaining = shuffle([...remaining]);
    for (const c of remaining) {
      this.board.revealCellQuick(c.row, c.col);
      await this.sleep(interval);
    }
  }

  isSolved(attempt, puzzle) {
    const a = alphaOnly(attempt || "");
    const target = alphaOnly(puzzle.puzzle);
    if (!a.length) return false;
    if (a === target) return true;
    // Spoken answers: forgive small transcription slips ("wont" vs "won't"
    // already normalizes away; this covers e.g. "there" vs "their").
    if (ui.wasVoiceAttempt()) {
      const tolerance = Math.max(1, Math.floor(target.length / 8));
      return levenshtein(a, target) <= tolerance;
    }
    return false;
  }

  puzzleLetters(puzzle) {
    return new Set(alphaOnly(puzzle.puzzle).replace(/[0-9]/g, ""));
  }

  // ------------------------------------------------------------------
  // CLASSIC ROUND (also used by Full Game)
  // Returns { winnings, hadMillion }
  // ------------------------------------------------------------------
  async classicRound({ roundLabel = "" } = {}) {
    const puzzle = this.newPuzzle("main");
    ui.show(ui.els.wheelWrap, true);
    ui.show(ui.els.solveWrap, true);
    ui.show(ui.els.scoreWrap, true);
    ui.setRoundLabel(roundLabel);
    SFX.reveal.play();
    await this.loadBoard(puzzle);

    const letters = this.puzzleLetters(puzzle);
    const consonants = [...letters].filter((l) => !VOWELS.includes(l));
    const vowels = [...letters].filter((l) => VOWELS.includes(l));
    let announcedVowels = false;
    let announcedConsonants = false;
    let isFreePlay = false;
    let hadMillion = false;
    const startScore = this.score;

    const allConsonantsUsed = () =>
      consonants.every((c) => this.usedLetters.has(c));
    const readyMessage = () => {
      if (allConsonantsUsed()) {
        ui.setMessage("No consonants left — buy a vowel or solve!");
      } else if (this.score >= VOWEL_COST) {
        ui.setMessage("Press <b>Space</b> to spin, type a vowel to buy ($250), or solve.");
      } else {
        ui.setMessage("Press <b>Space</b> to spin.");
      }
    };

    const checkCompletion = () => {
      if (!announcedVowels && vowels.length && vowels.every((v) => this.usedLetters.has(v))) {
        announcedVowels = true;
        SFX.vowels.play();
      }
      if (!announcedConsonants && consonants.length && allConsonantsUsed()) {
        announcedConsonants = true;
        SFX.consonants.play();
      }
    };

    const revealMatches = async (letter) => {
      const matches = this.cellsFor(letter);
      for (let i = 0; i < matches.length; i++) {
        SFX.ding.play();
        SFX.tileFlip.play();
        this.board.revealCell(matches[i].row, matches[i].col, { blueMs: 450 });
        await this.sleep(420);
      }
      await this.sleep(500);
    };

    readyMessage();

    while (true) {
      this.check();
      const action = await this.input.next();
      if (action.type === "solve") {
        const attempt = await ui.showSolveBar({ title: "Solve the puzzle!" });
        this.check();
        if (attempt === null) {
          readyMessage();
          continue;
        }
        if (this.isSolved(attempt, puzzle)) {
          break; // solved!
        }
        SFX.buzzer.play();
        ui.setMessage("Not quite — keep going!");
        await this.sleep(1200);
        readyMessage();
        continue;
      }
      if (action.type !== "key") continue;

      // Buy a vowel
      if (VOWELS.includes(action.key) && !isFreePlay) {
        if (this.score < VOWEL_COST) {
          ui.setMessage("You need $250 to buy a vowel. Spin instead!");
          continue;
        }
        if (this.usedLetters.has(action.key)) {
          SFX.buzzer.play();
          ui.setMessage(`'${action.key}' has already been used.`);
          continue;
        }
        this.setScore(this.score - VOWEL_COST);
        this.markUsed(action.key);
        const matches = this.cellsFor(action.key);
        if (matches.length) {
          ui.setMessage(`Yes! ${matches.length} '${action.key}'${matches.length > 1 ? "s" : ""}.`);
          await revealMatches(action.key);
          checkCompletion();
        } else {
          SFX.buzzer.play();
          ui.setMessage(`Sorry, no '${action.key}'s.`);
          await this.sleep(900);
        }
        readyMessage();
        continue;
      }

      if (action.code !== "Space") continue;
      if (allConsonantsUsed()) {
        readyMessage();
        continue;
      }

      // --- Spin! ---
      ui.setMessage("Spinning…");
      SFX.spin.volume(0.6);
      SFX.spin.play();
      const wedge = await this.wheel.spin();
      // The sample is slightly longer than the physics — fade it out as
      // the wheel settles so they always end together.
      SFX.spin.fade(0.6, 0, 500);
      setTimeout(() => SFX.spin.stop(), 550);
      this.check();

      let spinValue = 0;
      if (wedge.type === "cash") {
        spinValue = wedge.value;
        ui.setMessage(`<b>${fmtMoney(wedge.value)}</b> — pick a consonant!`);
      } else if (wedge.type === "bankrupt") {
        SFX.bankrupt.play();
        // Bankrupt wipes this round's earnings only.
        this.setScore(Math.min(this.score, startScore));
        hadMillion = false;
        ui.setMessage("<b>BANKRUPT!</b> Round winnings lost. Spin again.");
        await this.sleep(1600);
        readyMessage();
        continue;
      } else if (wedge.type === "loseturn") {
        SFX.buzzer.play();
        ui.setMessage("<b>LOSE A TURN!</b> (Solo game — spin again.)");
        await this.sleep(1400);
        readyMessage();
        continue;
      } else if (wedge.type === "freeplay") {
        isFreePlay = true;
        spinValue = 500;
        ui.setMessage("<b>FREE PLAY!</b> Guess any letter — vowels are free, no penalty.");
      } else if (wedge.type === "wildcard") {
        spinValue = 500;
        ui.setMessage("<b>WILD CARD!</b> Worth $500 — pick a consonant.");
      } else if (wedge.type === "million") {
        hadMillion = true;
        spinValue = 900;
        ui.setMessage("💰 <b>MILLION DOLLAR WEDGE!</b> Hold onto it — pick a consonant.");
      }

      // Wait for a letter guess
      let guessed = false;
      while (!guessed) {
        const g = await this.input.next();
        if (g.type !== "key" || !/^[A-Z]$/.test(g.key)) continue;
        const letter = g.key;
        if (VOWELS.includes(letter) && !isFreePlay) {
          ui.setMessage("Vowels must be purchased — pick a consonant.");
          continue;
        }
        if (this.usedLetters.has(letter)) {
          SFX.buzzer.play();
          ui.setMessage(`'${letter}' has already been used. Pick another.`);
          continue;
        }
        guessed = true;
        this.markUsed(letter);
        const matches = this.cellsFor(letter);
        if (matches.length) {
          if (!VOWELS.includes(letter)) {
            this.setScore(this.score + spinValue * matches.length);
          }
          ui.setMessage(
            `${matches.length} '${letter}'${matches.length > 1 ? "s" : ""}! Keep going.`
          );
          await revealMatches(letter);
          checkCompletion();
        } else {
          SFX.buzzer.play();
          ui.setMessage(`Sorry, no '${letter}'s. Spin again.`);
          await this.sleep(1100);
        }
      }
      isFreePlay = false;
      readyMessage();
    }

    // Solved!
    stopAllMusic();
    SFX.solved.play();
    fx.celebrateSolve();
    this.board.setGlow("gold");
    ui.setMessage(`You solved it! <b>"${puzzle.puzzle}"</b>`);
    await this.revealAllRemaining({ interval: 120 });
    let winnings = this.score - startScore;
    if (winnings < 1000) {
      // House minimum, like the show.
      const bonusUp = 1000 - Math.max(0, winnings);
      this.setScore(this.score + bonusUp);
      winnings = this.score - startScore;
      await this.sleep(400);
      ui.setMessage(
        `You solved it! House minimum applied — round winnings: <b>${fmtMoney(winnings)}</b>`
      );
    }
    await this.sleep(2200);
    this.board.setGlow(null);
    return { winnings, hadMillion };
  }

  // ------------------------------------------------------------------
  // TOSS-UP round.
  // opts: { mode: 'decay' | 'fixed', value, revealMs, oneShot }
  // Returns { solved, points, timeSec }
  // ------------------------------------------------------------------
  async tossUpRound({ mode = "decay", value = 1000, revealMs = 1000, oneShot = false, puzzle = null } = {}) {
    if (puzzle) {
      // Explicit puzzle (e.g. a themed Triple Toss-Up set entry).
      this.usedLetters = new Set();
      ui.resetTracker();
    } else {
      puzzle = this.newPuzzle("main");
    }
    SFX.reveal.play();
    await this.loadBoard(puzzle);
    ui.setMessage("Get ready…");
    await this.sleep(900);

    const order = shuffle([...this.board.unrevealedCells()]);
    const totalLetters = order.length;
    const duration = Math.max(1, totalLetters - 1) * revealMs;

    let running = true;
    let points = mode === "decay" ? 1000 : value;
    let revealed = 0;
    let elapsed = 0;
    let lastTick = performance.now();
    let outcome = null; // 'solved' | 'failed'
    let solveTimeSec = 0;

    playTossupMusic();
    this.board.setGlow("green");
    ui.setMessage("Press <b>Space</b> to buzz in!");
    if (mode === "fixed") ui.els.tossupPoints.textContent = points.toLocaleString();

    const timer = setInterval(() => {
      if (!running) return;
      const now = performance.now();
      elapsed += now - lastTick;
      lastTick = now;

      if (mode === "decay") {
        const progress = Math.min(1, elapsed / duration);
        points = Math.round(1000 * Math.pow(1 - progress, 0.5));
        ui.els.tossupPoints.textContent = points;
      }
      const shouldBeRevealed = Math.min(totalLetters, Math.floor(elapsed / revealMs) + 1);
      while (revealed < shouldBeRevealed) {
        const c = order[revealed++];
        this.board.revealCellQuick(c.row, c.col);
      }
      if (revealed >= totalLetters || (mode === "decay" && points <= 0)) {
        finish("failed");
      }
    }, 50);

    const finish = (result) => {
      if (outcome) return;
      outcome = result;
      running = false;
      clearInterval(timer);
      this.input.push({ type: "tossup-over" });
    };

    try {
      while (!outcome) {
        const action = await this.input.next();
        if (action.type === "tossup-over") break;
        if (action.type !== "key" || action.code !== "Space") continue;

        // Buzz in — pause the clock.
        running = false;
        SFX.ding.play();
        this.board.setGlow("blue");
        const buzzAt = elapsed;
        this.log("tossup buzz at", buzzAt.toFixed(0), "ms");
        const attempt = await ui.showSolveBar({
          title: "Solve!",
          pointsText: `For ${points.toLocaleString()} points!`,
        });
        this.check();
        this.log("tossup attempt:", JSON.stringify(attempt));
        if (attempt !== null && this.isSolved(attempt, puzzle)) {
          solveTimeSec = buzzAt / 1000;
          finish("solved");
          break;
        }
        SFX.buzzer.play();
        if (oneShot) {
          finish("failed");
          this.failReason = "wrong";
          break;
        }
        // Resume
        this.board.setGlow("green");
        lastTick = performance.now();
        running = true;
      }
    } finally {
      running = false;
      clearInterval(timer);
      stopTossupMusic();
    }
    this.check();

    const solved = outcome === "solved";
    this.log("tossup outcome:", outcome, "points:", points);
    if (solved) {
      SFX.tossupSolved.play();
      fx.celebrateSolve();
      this.board.setGlow("gold");
      ui.setMessage(
        `Solved in <b>${solveTimeSec.toFixed(1)}s</b> for <b>${points.toLocaleString()}</b>!`
      );
    } else {
      points = 0;
      this.board.setGlow(null);
      SFX.buzzer.play();
      ui.setMessage(
        this.failReason === "wrong" ? "Sorry, that's not it!" : "Time's up!"
      );
      this.failReason = null;
    }
    await this.revealAllRemaining({ shuffled: true, interval: 90 });
    await this.sleep(1200);
    this.board.setGlow(null);
    return { solved, points, timeSec: solveTimeSec };
  }

  // ------------------------------------------------------------------
  // BONUS ROUND. Returns { won, prize }
  // ------------------------------------------------------------------
  async bonusRound({ hadMillion = false } = {}) {
    const puzzle = this.newPuzzle("bonus");
    ui.show(ui.els.wheelWrap, false);
    ui.show(ui.els.solveWrap, false);

    // Draw the prize envelope now; reveal it at the end.
    const prizes = ["$40,000", "$45,000", "$50,000", "$75,000", "$100,000", "A NEW CAR"];
    let prize = prizes[Math.floor(rand(0, prizes.length))];
    if (hadMillion && Math.random() < 0.1) prize = "$1,000,000";

    SFX.bonus.play();
    await this.loadBoard(puzzle);

    // Reveal R S T L N E
    ui.setMessage("Revealing <b>R S T L N E</b>…");
    GIVEN_LETTERS.forEach((l) => this.markUsed(l));
    for (const letter of GIVEN_LETTERS) {
      const matches = this.cellsFor(letter);
      for (const m of matches) {
        SFX.ding.play();
        SFX.tileFlip.play();
        this.board.revealCell(m.row, m.col, { blueMs: 350 });
        await this.sleep(380);
      }
    }
    await this.sleep(700);
    SFX.bonus.stop();
    SFX.bonus2.play();

    // Player picks 3 consonants + 1 vowel
    const picks = { consonants: [], vowel: "" };
    const pickMessage = () => {
      const parts = [];
      const cLeft = 3 - picks.consonants.length;
      if (cLeft > 0) parts.push(`${cLeft} consonant${cLeft > 1 ? "s" : ""}`);
      if (!picks.vowel) parts.push("1 vowel");
      const picked = [...picks.consonants, picks.vowel].filter(Boolean).join(" ");
      ui.setMessage(
        `Type ${parts.join(" and ")}.` +
          (picked ? ` <span class="picked-letters">${picked}</span>` : "")
      );
    };
    pickMessage();

    while (picks.consonants.length < 3 || !picks.vowel) {
      const action = await this.input.next();
      if (action.type !== "key" || !/^[A-Z]$/.test(action.key)) continue;
      const letter = action.key;
      if (this.usedLetters.has(letter)) {
        SFX.buzzer.play();
        continue;
      }
      if (VOWELS.includes(letter)) {
        if (picks.vowel) {
          SFX.buzzer.play();
          continue;
        }
        picks.vowel = letter;
      } else {
        if (picks.consonants.length >= 3) {
          SFX.buzzer.play();
          continue;
        }
        picks.consonants.push(letter);
      }
      this.markUsed(letter);
      SFX.ding.play();
      pickMessage();
    }

    await this.sleep(800);
    for (const letter of [...picks.consonants, picks.vowel]) {
      const matches = this.cellsFor(letter);
      for (const m of matches) {
        SFX.ding.play();
        SFX.tileFlip.play();
        this.board.revealCell(m.row, m.col, { blueMs: 350 });
        await this.sleep(380);
      }
    }
    await this.sleep(600);

    // 10 seconds to buzz in and solve.
    SFX.bonus2.stop();
    SFX.tenSecond.play();
    this.board.setGlow("green");
    let won = false;

    let timeLeft = 10;
    let countdown = null;
    try {
      const showTime = () =>
        ui.setMessage(
          `Press <b>Space</b> to solve! <span class="time-left">${timeLeft}s</span>`
        );
      showTime();
      let expired = false;
      countdown = setInterval(() => {
        timeLeft--;
        if (timeLeft <= 0) {
          expired = true;
          clearInterval(countdown);
          this.input.push({ type: "bonus-timeout" });
        } else showTime();
      }, 1000);

      while (!expired) {
        const action = await this.input.next();
        if (action.type === "bonus-timeout") break;
        if (action.type !== "key" || action.code !== "Space") continue;
        clearInterval(countdown);
        this.board.setGlow("blue");
        const attempt = await ui.showSolveBar({ title: "Solve the bonus puzzle!" });
        this.check();
        won = attempt !== null && this.isSolved(attempt, puzzle);
        break;
      }
    } finally {
      clearInterval(countdown);
      SFX.tenSecond.stop();
    }
    this.check();

    if (won) {
      SFX.bonusWin.play();
      this.board.setGlow("gold");
      fx.celebrateBig(6000);
      ui.setMessage(
        `<b>YOU WIN!</b> "${puzzle.puzzle}" — the envelope held… <b>${prize}</b>! 🎉`
      );
      await this.revealAllRemaining({ interval: 120 });
    } else {
      SFX.buzzer.play();
      ui.setMessage(`So close! It was: <b>"${puzzle.puzzle}"</b>`);
      await this.sleep(1000);
      SFX.bonusLose.play();
      this.board.setGlow(null);
      await this.revealAllRemaining({ shuffled: true, interval: 350 });
      await this.sleep(400);
      ui.setMessage(
        `It was: <b>"${puzzle.puzzle}"</b> — the envelope held ${prize}.`
      );
    }
    await this.sleep(2500);
    this.board.setGlow(null);
    return { won, prize };
  }

  // ------------------------------------------------------------------
  // Wait for a spacebar press (used between rounds).
  // ------------------------------------------------------------------
  async waitForSpace() {
    while (true) {
      const action = await this.input.next();
      if (action.type === "key" && action.code === "Space") return;
      if (action.type === "solve") return;
    }
  }
}
