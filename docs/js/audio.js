// All game audio: Howler-backed samples plus a synthesized wheel-peg tick.

/* global Howl, Howler */

function howl(src, opts = {}) {
  return new Howl({ src: [`assets/sounds/${src}`], volume: 1.0, ...opts });
}

export const SFX = {
  ding: howl("ding.mp3"),
  spin: howl("spin.mp3", { volume: 0.6 }),
  reveal: howl("reveal.mp3"),
  buzzer: howl("buzzer.mp3", { volume: 0.4 }),
  solved: howl("solved.mp3"),
  bankrupt: howl("bankrupt.mp3"),
  vowels: howl("vowels.mp3"),
  consonants: howl("consonants.mp3"),
  tossupSolved: howl("tossupsolved.mp3"),
  bonus: howl("bonus.mp3", { loop: true }),
  bonus2: howl("bonus2.mp3", { loop: true }),
  bonusWin: howl("bonuswin.mp3"),
  bonusLose: howl("bonuslose.mp3"),
  tenSecond: howl("10second.mp3"),
  // Generated SFX (ElevenLabs)
  tileFlip: howl("tileflip.mp3", { volume: 0.35 }),
  banner: howl("banner.mp3", { volume: 0.7 }),
  click: howl("click.mp3", { volume: 0.5 }),
  sparkle: howl("sparkle.mp3", { volume: 0.55 }),
};

const tossupTracks = [
  howl("tossup1.mp3", { volume: 0.5 }),
  howl("tossup2.mp3", { volume: 0.5 }),
  howl("tossup3.mp3", { volume: 0.5 }),
];
const tossupSequence = [0, 1, 2, 1];
let tossupIndex = 0;
let currentTossup = null;

export function playTossupMusic() {
  currentTossup = tossupTracks[tossupSequence[tossupIndex]];
  currentTossup.once("end", playTossupMusic);
  currentTossup.play();
  tossupIndex = (tossupIndex + 1) % tossupSequence.length;
}

export function stopTossupMusic() {
  if (currentTossup) {
    currentTossup.off("end");
    currentTossup.stop();
    currentTossup = null;
  }
}

export function stopAllMusic() {
  stopTossupMusic();
  SFX.bonus.stop();
  SFX.bonus2.stop();
  SFX.bonusWin.stop();
  SFX.bonusLose.stop();
  SFX.tenSecond.stop();
}

// --- Synthesized wheel peg tick (no sample needed, zero latency) ---
let audioCtx = null;
function ctx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

let muted = false;

export function tick(intensity = 1) {
  if (muted) return;
  try {
    const ac = ctx();
    const t0 = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(1900, t0);
    osc.frequency.exponentialRampToValueAtTime(700, t0 + 0.03);
    gain.gain.setValueAtTime(0.06 * intensity, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.045);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + 0.05);
  } catch {
    /* audio not available yet — ignore */
  }
}

export function setMuted(m) {
  muted = m;
  Howler.mute(m);
}
export function isMuted() {
  return muted;
}

// Duck all game audio while the mic is listening, so music/SFX don't
// bleed into the recording and pollute the transcription.
export function duck(on) {
  Howler.volume(on ? 0.08 : 1.0);
}
