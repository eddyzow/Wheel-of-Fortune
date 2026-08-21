// DOM layer: messages, scores, solve bar, banners, letter tracker, menu.

import { fmtMoney } from "./util.js";
import { SFX } from "./audio.js";
import * as voice from "./voice.js";

const $ = (sel) => document.querySelector(sel);

export const els = {
  get menu() { return $("#intro-modal"); },
  get overlay() { return $("#modal-overlay"); },
  get about() { return $("#about-modal"); },
  get header() { return $("#game-header"); },
  get main() { return $("#game-root"); },
  get category() { return $("#category-label"); },
  get message() { return $("#message-label"); },
  get score() { return $("#score-amount"); },
  get scoreWrap() { return $("#player-score"); },
  get roundWrap() { return $("#round-indicator"); },
  get tossupPoints() { return $("#tossup-points"); },
  get tossupWrap() { return $("#tossup-points-display"); },
  get avgPoints() { return $("#avg-points"); },
  get avgWrap() { return $("#avg-points-display"); },
  get solveBtn() { return $("#solve-btn"); },
  get solveWrap() { return $("#solve-btn-container"); },
  get wheelWrap() { return $("#wheel-dock"); },
  get boardRegion() { return $("#board-region"); },
  get tracker() { return $("#letter-tracker"); },
  get banner() { return $("#round-banner"); },
  get solveBar() { return $("#bottom-solve-bar"); },
  get solveInput() { return $("#solve-bar-input"); },
  get solveTitle() { return $("#solve-bar-title"); },
  get solvePoints() { return $("#solve-bar-points"); },
};

export function setMessage(html, color = null) {
  els.message.innerHTML = html;
  els.message.style.color = color || "";
}

export function setCategory(text) {
  els.category.textContent = text;
  els.category.classList.toggle("empty", !text);
}

export function setScore(amount) {
  els.score.textContent = amount.toLocaleString("en-US");
}

export function setRoundLabel(text) {
  els.roundWrap.textContent = text || "";
  els.roundWrap.classList.toggle("hidden", !text);
}

export function show(el, visible) {
  el.classList.toggle("hidden", !visible);
}

// --- Letter tracker (A–Z strip; used letters dim out) ---

export function buildTracker() {
  const tracker = els.tracker;
  tracker.innerHTML = "";
  for (let i = 0; i < 26; i++) {
    const ch = String.fromCharCode(65 + i);
    const span = document.createElement("span");
    span.textContent = ch;
    span.dataset.letter = ch;
    span.className = "tracker-letter" + ("AEIOU".includes(ch) ? " vowel" : "");
    tracker.appendChild(span);
  }
}

export function markLetterUsed(letter) {
  const el = els.tracker.querySelector(`[data-letter="${letter}"]`);
  el?.classList.add("used");
}

export function resetTracker() {
  els.tracker
    .querySelectorAll(".tracker-letter")
    .forEach((el) => el.classList.remove("used"));
}

// --- Round banner: big animated title card ---

export function showBanner(title, subtitle = "", holdMs = 1600) {
  return new Promise((resolve) => {
    SFX.banner.play();
    const banner = els.banner;
    banner.innerHTML =
      `<div class="banner-title">${title}</div>` +
      (subtitle ? `<div class="banner-subtitle">${subtitle}</div>` : "");
    banner.classList.add("visible");
    setTimeout(() => {
      banner.classList.remove("visible");
      setTimeout(resolve, 350);
    }, holdMs);
  });
}

// --- Solve bar (promise-based, with spoken answers via Scribe) ---

let solveResolve = null;
let voiceCapture = null;
let lastAttemptVoice = false;

const voiceStatus = (html) => {
  const el = $("#solve-bar-voice");
  el.classList.toggle("hidden", !html);
  el.innerHTML = html || "";
};

export function wasVoiceAttempt() {
  return lastAttemptVoice;
}

function stopVoiceCapture() {
  voiceCapture?.cancel();
  voiceCapture = null;
  voiceStatus("");
}

// Listen for a spoken answer and auto-submit its transcript.
function startVoiceCapture() {
  if (!voice.isEnabled()) return;
  const mySession = solveResolve;
  voiceStatus("🎤 listening…");
  const capture = voice.recordUtterance({
    onSpeech: () => solveResolve === mySession && voiceStatus("🎤 hearing you…"),
  });
  voiceCapture = capture;
  capture.blob.then(async (blob) => {
    if (solveResolve !== mySession || !blob) return;
    voiceStatus("✨ transcribing…");
    try {
      const text = await voice.transcribe(blob);
      if (solveResolve !== mySession) return;
      if (!text) {
        voiceStatus("🎤 didn't catch that — type it or press Esc");
        return;
      }
      els.solveInput.value = text;
      lastAttemptVoice = true;
      closeSolveBar(text);
    } catch (e) {
      console.warn("voice transcribe failed:", e);
      if (solveResolve === mySession) voiceStatus("⚠️ voice failed — type your answer");
    }
  });
}

export function showSolveBar({ title = "Solve!", pointsText = "" } = {}) {
  return new Promise((resolve) => {
    solveResolve = resolve;
    lastAttemptVoice = false;
    els.solveTitle.textContent = title;
    els.solvePoints.textContent = pointsText;
    els.solvePoints.style.display = pointsText ? "" : "none";
    els.solveInput.value = "";
    els.solveBar.classList.add("visible");
    setTimeout(() => els.solveInput.focus(), 60);
    startVoiceCapture();
  });
}

export function solveBarVisible() {
  return els.solveBar.classList.contains("visible");
}

function closeSolveBar(value) {
  stopVoiceCapture();
  els.solveBar.classList.remove("visible");
  els.solveInput.blur();
  const r = solveResolve;
  solveResolve = null;
  r?.(value);
}

export function initSolveBar() {
  $("#solve-bar-submit-btn").addEventListener("click", () =>
    closeSolveBar(els.solveInput.value)
  );
  $("#solve-bar-close-btn").addEventListener("click", () =>
    closeSolveBar(null)
  );
  els.solveInput.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") closeSolveBar(els.solveInput.value);
    if (e.key === "Escape") closeSolveBar(null);
  });
}

// --- Menu ---

export function showMenu() {
  els.overlay.style.display = "block";
  els.menu.style.display = "";
  els.menu.classList.add("open");
  show(els.main, false);
  show(els.header, false);
}

export function hideMenu() {
  els.overlay.style.display = "none";
  els.menu.classList.remove("open");
  els.menu.style.display = "none";
  show(els.main, true);
  show(els.header, true);
}

export function flashScore() {
  els.scoreWrap.classList.remove("flash");
  void els.scoreWrap.offsetWidth;
  els.scoreWrap.classList.add("flash");
}

export { fmtMoney };
