// Bootstrap and mode orchestration.

import { loadPuzzles, PuzzleBag } from "./puzzles.js";
import { Wheel } from "./wheel.js";
import { Board3D } from "./board3d.js";
import * as fx from "./fx.js";
import * as ui from "./ui.js";
import { Game, Input, AbortGame } from "./modes.js";
import { SFX, stopAllMusic, setMuted, isMuted } from "./audio.js";
import { fmtMoney, delay } from "./util.js";

let game = null;
let input = null;
let running = false;

async function init() {
  // Make sure the display font is in before any canvas text is rasterized.
  try {
    await Promise.race([
      document.fonts.load("900 100px 'Roboto'"),
      delay(2500),
    ]);
  } catch { /* fall back to system font */ }

  const { main, bonus } = await loadPuzzles();
  const board = new Board3D(document.getElementById("board-canvas"));
  const wheel = new Wheel(document.getElementById("wheel-canvas"));

  // The DOM layout drives where the board renders: track the region box.
  const region = document.getElementById("board-region");
  const updateRegion = () => board.setRegion(region.getBoundingClientRect());
  new ResizeObserver(updateRegion).observe(region);
  window.addEventListener("resize", updateRegion);
  updateRegion();

  // Soft click for every button press.
  document.addEventListener("click", (e) => {
    if (e.target.closest("button, .mode-card")) SFX.click.play();
  });
  input = new Input();
  game = new Game({
    board,
    wheel,
    input,
    bags: { main: new PuzzleBag(main), bonus: new PuzzleBag(bonus) },
  });

  window.wof = { game, input, wheel, board }; // console debugging handle

  ui.buildTracker();
  ui.initSolveBar();
  wireMenu();
  wireHeader();

  document.getElementById("puzzle-count").textContent =
    `${main.length.toLocaleString()} puzzles · ${bonus.length.toLocaleString()} bonus puzzles loaded`;

  ui.showMenu();
  document.getElementById("intro-modal").classList.add("ready");
}

function wireMenu() {
  document.querySelectorAll(".mode-card").forEach((card) => {
    card.addEventListener("click", () => startMode(card.dataset.mode));
  });
  document
    .getElementById("intro-about-btn")
    .addEventListener("click", showAbout);
}

function wireHeader() {
  document.getElementById("back-btn").addEventListener("click", () => {
    abortToMenu();
  });
  document.getElementById("about-btn").addEventListener("click", showAbout);
  const muteBtn = document.getElementById("mute-btn");
  muteBtn.addEventListener("click", () => {
    setMuted(!isMuted());
    muteBtn.textContent = isMuted() ? "🔇" : "🔊";
  });
  document.querySelectorAll(".close-modal-btn").forEach((b) =>
    b.addEventListener("click", () => {
      document.getElementById("about-modal").style.display = "none";
      if (!running) ui.showMenu();
      else document.getElementById("modal-overlay").style.display = "none";
    })
  );
  document.getElementById("solve-btn").addEventListener("click", () => {
    input.push({ type: "solve" });
  });
}

function showAbout() {
  document.getElementById("modal-overlay").style.display = "block";
  document.getElementById("about-modal").style.display = "block";
  if (!running) document.getElementById("intro-modal").style.display = "none";
}

function abortToMenu() {
  stopAllMusic();
  input.abort();
}

async function startMode(mode) {
  if (running) return;
  running = true;
  input.reset();
  ui.hideMenu();
  game.setScore(0, false);
  ui.setRoundLabel("");
  ui.setMessage("");
  ui.setCategory("");
  game.board.reset();

  try {
    if (mode === "classic") await runClassic();
    else if (mode === "full") await runFullGame();
    else if (mode === "tossup") await runEndlessTossup();
    else if (mode === "triple") await runTripleTossup();
    else if (mode === "bonus") await runBonusOnly();
  } catch (e) {
    if (!(e instanceof AbortGame)) console.error(e);
  } finally {
    running = false;
    stopAllMusic();
    game.board.reset();
    ui.setCategory("");
    ui.showMenu();
  }
}

function baseLayout({ wheel = false, score = false, tossup = false, avg = false }) {
  ui.show(ui.els.wheelWrap, wheel);
  ui.show(ui.els.solveWrap, wheel);
  ui.show(ui.els.scoreWrap, score);
  ui.show(ui.els.tossupWrap, tossup);
  ui.show(ui.els.avgWrap, avg);
}

// --- Classic: endless rounds, score carries over ---
async function runClassic() {
  baseLayout({ wheel: true, score: true });
  let round = 1;
  while (true) {
    await ui.showBanner(`ROUND ${round}`, "Spin. Guess. Solve!");
    await game.classicRound({ roundLabel: `Round ${round}` });
    ui.setMessage("Press <b>Space</b> for the next round!");
    await game.waitForSpace();
    round++;
  }
}

// --- Full game: toss-ups, two rounds, bonus round ---
async function runFullGame() {
  baseLayout({ score: true, tossup: false });
  let hadMillion = false;

  await ui.showBanner("TOSS-UP", "$1,000 — buzz in with Space");
  baseLayout({ score: true, tossup: true });
  const t1 = await game.tossUpRound({ mode: "fixed", value: 1000, revealMs: 900, oneShot: true });
  if (t1.solved) game.setScore(game.score + t1.points);
  baseLayout({ score: true });

  for (let r = 1; r <= 2; r++) {
    await ui.showBanner(`ROUND ${r}`, "Good luck!");
    baseLayout({ wheel: true, score: true });
    const res = await game.classicRound({ roundLabel: `Round ${r} of 2` });
    hadMillion = hadMillion || res.hadMillion;
    baseLayout({ score: true });
    if (r < 2) {
      ui.setMessage("Press <b>Space</b> to continue…");
      await game.waitForSpace();
    }
  }

  await ui.showBanner("BONUS ROUND", "R S T L N E and three more…");
  const b = await game.bonusRound({ hadMillion });
  const prizeValue = parsePrize(b.prize);
  if (b.won && prizeValue) game.setScore(game.score + prizeValue);

  await ui.showBanner(
    "FINAL TOTAL",
    `<b>${fmtMoney(game.score)}</b>${b.won ? " — incredible!" : ""}`,
    3500
  );
  fx.celebrateBig(4000);
  ui.setMessage(`Final total: <b>${fmtMoney(game.score)}</b> — press <b>Space</b> for the menu.`);
  await game.waitForSpace();
}

function parsePrize(prize) {
  const n = prize.replace(/[^0-9]/g, "");
  return n ? parseInt(n, 10) : 35000; // a new car, valued generously
}

// --- Endless toss-up with running average ---
async function runEndlessTossup() {
  baseLayout({ tossup: true, avg: true });
  let total = 0;
  let rounds = 0;
  while (true) {
    const res = await game.tossUpRound({ mode: "decay", revealMs: 1000 });
    total += res.points;
    rounds++;
    ui.els.avgPoints.textContent = Math.round(total / rounds).toLocaleString();
    ui.setMessage(
      (res.solved
        ? `Solved for <b>${res.points.toLocaleString()}</b>! `
        : "") + "Press <b>Space</b> for the next toss-up."
    );
    await game.waitForSpace();
  }
}

// --- Triple toss-up: $1000 / $2000 / $3000 ---
async function runTripleTossup() {
  baseLayout({ tossup: true, score: true });
  const values = [1000, 2000, 3000];
  let won = 0;
  for (let i = 0; i < 3; i++) {
    await ui.showBanner(`TOSS-UP ${i + 1} OF 3`, fmtMoney(values[i]));
    const res = await game.tossUpRound({
      mode: "fixed",
      value: values[i],
      revealMs: 850,
      oneShot: true,
    });
    if (res.solved) {
      game.setScore(game.score + values[i]);
      won++;
    }
    await delay(600);
  }
  await ui.showBanner(
    won === 3 ? "CLEAN SWEEP!" : "TRIPLE TOSS-UP COMPLETE",
    `You banked <b>${fmtMoney(game.score)}</b>`,
    3000
  );
  if (won === 3) fx.celebrateBig(3500);
  ui.setMessage(`You banked <b>${fmtMoney(game.score)}</b> — press <b>Space</b> for the menu.`);
  await game.waitForSpace();
}

// --- Bonus round, standalone ---
async function runBonusOnly() {
  baseLayout({});
  while (true) {
    await ui.showBanner("BONUS ROUND", "R S T L N E and three more…");
    await game.bonusRound({});
    ui.setMessage("Press <b>Space</b> to play another bonus round.");
    await game.waitForSpace();
  }
}

init().catch((e) => {
  console.error(e);
  document.getElementById("message-label").textContent =
    "Error loading the game — check the console.";
});
