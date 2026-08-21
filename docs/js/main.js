// Bootstrap and mode orchestration.

import { loadPuzzles, PuzzleBag } from "./puzzles.js";
import { Wheel } from "./wheel.js";
import { Board3D } from "./board3d.js";
import * as fx from "./fx.js";
import * as ui from "./ui.js";
import { Game, Input, AbortGame } from "./modes.js";
import { SFX, stopAllMusic, setMuted, isMuted } from "./audio.js";
import { fmtMoney, delay } from "./util.js";
import * as voice from "./voice.js";

let game = null;
let input = null;
let running = false;

// Loading screen (inline in index.html) — driven by real milestones.
function setLoad(pct, status) {
  const bar = document.getElementById("loading-bar");
  const label = document.getElementById("loading-status");
  if (bar) bar.style.width = pct + "%";
  if (label && status) label.textContent = status;
}
function hideLoader() {
  const el = document.getElementById("loading-screen");
  if (!el) return;
  el.style.opacity = "0";
  el.style.pointerEvents = "none";
  setTimeout(() => el.remove(), 700);
}

async function init() {
  window.__wofBooted = true; // engine modules arrived — cancel the watchdog
  (window.__wofLoaderTimers || []).forEach(clearTimeout);
  setLoad(12, "Loading fonts…");
  // Make sure the display font is in before any canvas text is rasterized.
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load("900 100px 'Roboto'"),
        document.fonts.load("800 100px 'Plus Jakarta Sans'"),
      ]),
      delay(2500),
    ]);
  } catch { /* fall back to system font */ }

  setLoad(28, "Loading puzzles…");
  const { main, bonus, triple } = await loadPuzzles();
  setLoad(45, "Building the stage…");
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
    bags: {
      main: new PuzzleBag(main),
      bonus: new PuzzleBag(bonus),
      triple: triple.length ? new PuzzleBag(triple) : null,
    },
  });

  window.wof = { game, input, wheel, board }; // console debugging handle
  window.wof.playTossup = async (puzzle, category = "PHRASE", opts = {}) => {
    if (running) {
      abortToMenu();
      await delay(350);
    }
    return startMode("custom-tossup", { puzzle, category, ...opts });
  };

  ui.buildTracker();
  ui.initSolveBar();
  wireMenu();
  wireHeader();

  document.getElementById("puzzle-count").textContent =
    `${main.length.toLocaleString()} puzzles · ${bonus.length.toLocaleString()} bonus puzzles loaded`;

  // Wait for the key textures (backdrop, pill, tiles) so the first frame
  // is the finished set — but never hang if one fails to load.
  setLoad(70, "Lighting the set…");
  await Promise.race([board.whenReady(), delay(12000)]);
  setLoad(100, "Ready!");
  await delay(250);

  ui.showMenu();
  document.getElementById("intro-modal").classList.add("ready");
  hideLoader();
}

function wireMenu() {
  document.querySelectorAll(".mode-card").forEach((card) => {
    card.addEventListener("click", () => startMode(card.dataset.mode));
  });
  document
    .getElementById("intro-settings-btn")
    .addEventListener("click", openSettings);
  document
    .getElementById("examine-btn")
    .addEventListener("click", () => startMode("examine"));
}

function wireHeader() {
  document.getElementById("back-btn").addEventListener("click", () => {
    abortToMenu();
  });
  document.querySelectorAll(".close-modal-btn").forEach((b) =>
    b.addEventListener("click", () => {
      document.getElementById("settings-modal").style.display = "none";
      if (!running) ui.showMenu();
      else document.getElementById("modal-overlay").style.display = "none";
    })
  );
  document.getElementById("solve-btn").addEventListener("click", () => {
    input.push({ type: "solve" });
  });
  wireSettings();
}

let refreshSettingsUI = null;

function wireSettings() {
  const keyInput = document.getElementById("el-key-input");
  const status = document.getElementById("voice-status");

  const toggleRow = document.getElementById("voice-toggle-row");
  const toggleBtn = document.getElementById("voice-toggle-btn");
  const soundBtn = document.getElementById("sound-toggle-btn");

  const refresh = () => {
    soundBtn.textContent = isMuted()
      ? "🔇 Sound: OFF — click to turn on"
      : "🔊 Sound: ON — click to turn off";
    const hasKey = !!voice.getKey();
    toggleRow.classList.toggle("hidden", !hasKey);
    if (!hasKey) {
      status.textContent = "Voice solving is off — paste an ElevenLabs API key to enable.";
      keyInput.placeholder = "Paste your ElevenLabs API key…";
      return;
    }
    keyInput.placeholder = "Key saved (paste a new one to replace, or Save empty to remove)";
    if (voice.isEnabled()) {
      status.textContent = "✅ Voice solving is ON — buzz with Space, then speak.";
      toggleBtn.textContent = "🔊 Voice solving: ON — click to turn off";
    } else {
      status.textContent = "Voice solving is OFF (key saved) — solves are typed.";
      toggleBtn.textContent = "🔇 Voice solving: OFF — click to turn on";
    }
  };

  toggleBtn.addEventListener("click", () => {
    voice.setVoiceOn(!voice.isVoiceOn());
    if (!voice.isEnabled()) voice.release();
    refresh();
  });

  soundBtn.addEventListener("click", () => {
    setMuted(!isMuted());
    refresh();
  });

  refreshSettingsUI = refresh;
  document.getElementById("settings-btn").addEventListener("click", openSettings);
  document.getElementById("el-key-save").addEventListener("click", () => {
    voice.setKey(keyInput.value);
    keyInput.value = "";
    refresh();
  });
  keyInput.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") document.getElementById("el-key-save").click();
  });

  // Mic test: record 3s, play it back, and (if a key is saved) show what
  // Scribe hears — separates capture problems from API problems.
  const testBtn = document.getElementById("mic-test-btn");
  const testResult = document.getElementById("mic-test-result");
  testBtn.addEventListener("click", async () => {
    testBtn.disabled = true;
    try {
      testResult.textContent = "🔴 Recording 3 seconds — say a puzzle…";
      const blob = await voice.testRecord(3000);
      testResult.textContent = `▶️ Playing back (${(blob.size / 1024).toFixed(0)} KB)…`;
      const url = URL.createObjectURL(blob);
      const player = new Audio(url);
      await player.play();
      await new Promise((r) => (player.onended = r));
      URL.revokeObjectURL(url);
      if (voice.isEnabled()) {
        testResult.textContent = "✨ Transcribing…";
        const text = await voice.transcribe(blob);
        testResult.textContent = text
          ? `🗣 Scribe heard: “${text}”`
          : "⚠️ Scribe heard nothing — check playback volume/mic device.";
      } else {
        testResult.textContent = "Playback done. Save an API key to test transcription too.";
      }
    } catch (e) {
      testResult.textContent = "⚠️ Mic test failed: " + (e?.message || e);
    } finally {
      testBtn.disabled = false;
    }
  });
}

function openSettings() {
  document.getElementById("modal-overlay").style.display = "block";
  document.getElementById("settings-modal").style.display = "block";
  if (!running) document.getElementById("intro-modal").style.display = "none";
  document.getElementById("el-key-input").value = ""; // never leave a key in the DOM
  refreshSettingsUI?.();
}

function abortToMenu() {
  stopAllMusic();
  input.abort();
}

async function startMode(mode, params = {}) {
  if (running) return;
  running = true;
  input.reset();
  ui.hideMenu();
  game.setScore(0, false);
  ui.setRoundLabel("");
  ui.setMessage("");
  ui.setCategory("");
  game.board.reset();

  // Warm the mic now so the first spoken solve records from its first word.
  voice.warmup();

  try {
    if (mode === "classic") await runClassic();
    else if (mode === "full") await runFullGame();
    else if (mode === "tossup") await runEndlessTossup();
    else if (mode === "triple") await runTripleTossup();
    else if (mode === "bonus") await runBonusOnly();
    else if (mode === "examine") await runExamine();
    else if (mode === "custom-tossup") await runCustomTossup(params);
  } catch (e) {
    if (!(e instanceof AbortGame)) console.error(e);
  } finally {
    running = false;
    voice.release(); // mic (and its indicator) off at the menu
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
// Authentic format: all three puzzles share a common word, and the third
// is a play on words (themed sets from triple_tossups.json).
async function runTripleTossup() {
  baseLayout({ tossup: true, score: true });
  const values = [1000, 2000, 3000];
  const set = game.bags.triple?.next() ?? null;
  let won = 0;
  for (let i = 0; i < 3; i++) {
    await ui.showBanner(`TOSS-UP ${i + 1} OF 3`, fmtMoney(values[i]));
    const res = await game.tossUpRound({
      mode: "fixed",
      value: values[i],
      revealMs: 850,
      oneShot: true,
      puzzle: set ? { category: set.category, puzzle: set.puzzles[i] } : null,
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

// --- Console/debug: play a specific puzzle as a toss-up ---
// wof.playTossup("AWESOME SAUCE", "FOOD & DRINK")           → decaying points
// wof.playTossup("AWESOME SAUCE", "PHRASE", { mode: "fixed", value: 2000 })
async function runCustomTossup({ puzzle, category = "PHRASE", mode = "decay", value = 1000, revealMs = 1000, oneShot = false }) {
  baseLayout({ tossup: true, avg: mode === "decay", score: mode === "fixed" });
  const res = await game.tossUpRound({
    mode, value, revealMs, oneShot,
    puzzle: { category: String(category).toUpperCase(), puzzle: String(puzzle).toUpperCase() },
  });
  if (res.solved && mode === "fixed") game.setScore(game.score + value);
  ui.setMessage(
    (res.solved ? `Solved for <b>${res.points.toLocaleString()}</b>! ` : "") +
      "Press <b>Space</b> for the menu."
  );
  await game.waitForSpace();
}

// --- Examine mode: free-look at the 3D board ---
async function runExamine() {
  baseLayout({});
  ui.show(ui.els.tracker, false);
  ui.setMessage("🔍 <b>Drag</b> to orbit · <b>scroll</b> to zoom · <b>Esc</b> or Menu to exit.");
  await game.loadBoard({ category: "BEHIND THE SCENES", puzzle: "WHEEL OF FORTUNE" });
  for (const c of game.board.unrevealedCells()) {
    game.board.revealCellQuick(c.row, c.col);
  }
  game.board.setExamine(true);
  try {
    while (true) {
      const a = await input.next();
      if (a.type === "key" && a.code === "Escape") break;
    }
  } finally {
    game.board.setExamine(false);
    ui.show(ui.els.tracker, true);
  }
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
  // Surface boot failures on the loader instead of a frozen bar.
  setLoad(100, "Something went wrong: " + (e?.message || e) + " — retry?");
  const retry = document.getElementById("loading-retry");
  if (retry) retry.style.display = "inline-block";
  document.getElementById("message-label").textContent =
    "Error loading the game — check the console.";
});
