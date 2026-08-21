// Spoken solves via the ElevenLabs Scribe speech-to-text API.
//
// The API key is pasted by the player into the in-game settings and lives
// only in localStorage on their machine — it is never bundled with the
// code and is only ever sent to api.elevenlabs.io.

const KEY_STORAGE = "wof_elevenlabs_key";

export function getKey() {
  try {
    return localStorage.getItem(KEY_STORAGE) || "";
  } catch {
    return "";
  }
}

export function setKey(key) {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key.trim());
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* private browsing — voice just stays off */
  }
}

const TOGGLE_STORAGE = "wof_voice_on";

// On/off switch, independent of the saved key (defaults to on).
export function isVoiceOn() {
  try {
    return localStorage.getItem(TOGGLE_STORAGE) !== "0";
  } catch {
    return true;
  }
}

export function setVoiceOn(on) {
  try {
    localStorage.setItem(TOGGLE_STORAGE, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function isEnabled() {
  return !!getKey() && isVoiceOn() && !!navigator.mediaDevices?.getUserMedia;
}

function pickMime() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || "";
}

// Record one spoken answer. Resolves with a Blob, or null if nothing was
// said / mic unavailable / cancelled. Stops after ~1.2s of post-speech
// silence or maxMs, whichever comes first.
//
// Returns { blob: Promise<Blob|null>, stop(), cancel() } — stop() ends the
// recording early and still resolves with audio; cancel() resolves null.
const dbg = (...args) => {
  (window.__voiceLog = window.__voiceLog || []).push(args.join(" "));
  console.debug("[voice]", ...args);
};

// --- Persistent mic stream ---
// Acquiring getUserMedia takes ~0.3-1s; if we grab it per-attempt, the
// player's first words happen before recording starts and Scribe only
// hears the tail. Keep one warm stream for the whole game session.
let cachedStream = null;

async function ensureStream() {
  if (cachedStream?.getAudioTracks().some((t) => t.readyState === "live")) {
    return cachedStream;
  }
  cachedStream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
  });
  dbg("mic stream acquired (persistent)");
  return cachedStream;
}

// Pre-warm at game start so the very first solve records from t=0.
export function warmup() {
  if (!isEnabled()) return;
  ensureStream().catch((e) => dbg("warmup failed:", e?.message || e));
}

// Turn the mic (and its browser indicator) off, e.g. back at the menu.
export function release() {
  cachedStream?.getTracks().forEach((t) => t.stop());
  cachedStream = null;
}

export function recordUtterance({ maxMs = 7000, silenceMs = 1200, onSpeech } = {}) {
  let resolveBlob;
  const blob = new Promise((res) => (resolveBlob = res));
  let recorder = null;
  let stream = null;
  let ctx = null;
  let rafId = 0;
  let cancelled = false;
  let spoke = false;

  // Failsafe: whatever happens (permission hang, setup error), the capture
  // ALWAYS ends by maxMs + grace.
  const maxTimer = setTimeout(() => finish(), maxMs + 1500);

  const cleanup = () => {
    cancelAnimationFrame(rafId);
    clearTimeout(maxTimer);
    // NOTE: the stream itself stays warm (see ensureStream) — we only
    // tear down this capture's recorder/analyser.
    ctx?.close().catch(() => {});
  };

  const finish = () => {
    if (recorder && recorder.state !== "inactive") recorder.stop();
    else {
      cleanup();
      resolveBlob(null);
    }
  };

  let maxRms = 0;

  (async () => {
    try {
      stream = await ensureStream();
      if (cancelled) {
        cleanup();
        resolveBlob(null);
        return;
      }

      const chunks = [];
      recorder = new MediaRecorder(stream, { mimeType: pickMime() || undefined });
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      recorder.onstop = () => {
        dbg(`recorder stopped (spoke=${spoke}, maxRms=${maxRms.toFixed(4)}, chunks=${chunks.length})`);
        cleanup();
        // Send anything with plausible audio in it — let Scribe be the
        // judge. Only skip clearly-dead-silent captures.
        const hasAudio = spoke || maxRms > 0.005;
        resolveBlob(
          cancelled || !hasAudio || !chunks.length
            ? null
            : new Blob(chunks, { type: recorder.mimeType })
        );
      };
      recorder.start(250);
      dbg("recording as", recorder.mimeType || "(default)");

      // Silence detection with an adaptive threshold: track the noise
      // floor and trigger on a clear rise above it.
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      await ctx.resume(); // autoplay policy can start it suspended
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      let quietSince = performance.now();
      let noiseFloor = 0.004;
      let loudFrames = 0; // consecutive frames above threshold
      let spokeAt = 0;
      const t0 = performance.now();

      const watch = () => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        if (rms > maxRms) maxRms = rms;
        const now = performance.now();
        if (!spoke) noiseFloor = Math.min(0.02, noiseFloor * 0.98 + rms * 0.02);
        const threshold = Math.max(0.01, noiseFloor * 2.5);
        if (rms > threshold) {
          // Require ~80ms of SUSTAINED sound before counting it as speech,
          // so a breath or key click can't start the silence countdown.
          loudFrames++;
          if (!spoke && loudFrames >= 5) {
            spoke = true;
            spokeAt = now;
            dbg(`speech detected (rms=${rms.toFixed(4)}, thr=${threshold.toFixed(4)})`);
            onSpeech?.();
          }
          quietSince = now;
        } else {
          loudFrames = 0;
          if (spoke && now - spokeAt > 900 && now - quietSince > silenceMs) {
            dbg("silence — stopping");
            finish();
            return;
          }
        }
        if (now - t0 > maxMs) {
          dbg(`max time (spoke=${spoke}, lastRms=${rms.toFixed(4)})`);
          finish();
          return;
        }
        rafId = requestAnimationFrame(watch);
      };
      rafId = requestAnimationFrame(watch);
    } catch (e) {
      dbg("capture setup failed:", e?.message || e);
      cleanup();
      resolveBlob(null);
    }
  })();

  return {
    blob,
    stop: finish,
    cancel: () => {
      cancelled = true;
      finish();
    },
  };
}

// Send a recorded answer to ElevenLabs Scribe; returns the transcript text.
// Fixed-length capture for the settings "Test Mic" button.
export async function testRecord(ms = 3000) {
  const stream = await ensureStream();
  return new Promise((resolve) => {
    const chunks = [];
    const rec = new MediaRecorder(stream, { mimeType: pickMime() || undefined });
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType }));
    rec.start(250);
    setTimeout(() => rec.stop(), ms);
  });
}

export async function transcribe(blob) {
  dbg(`sending ${blob.size} bytes (${blob.type})`);
  const key = getKey();
  if (!key) throw new Error("no API key");
  const form = new FormData();
  form.append("model_id", "scribe_v1");
  form.append("language_code", "en");
  // Without this, Scribe annotates non-speech as tags like "[NOISE]" or
  // "(laughter)" — which then get judged as the player's answer.
  form.append("tag_audio_events", "false");
  form.append(
    "file",
    blob,
    blob.type.includes("mp4") ? "answer.mp4" : "answer.webm"
  );
  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": key },
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Scribe ${res.status}: ${detail.slice(0, 120)}`);
  }
  const data = await res.json();
  const raw = (data.text || "").trim();
  // Belt and braces: strip any bracketed/parenthesized event tags anyway.
  const cleaned = raw.replace(/[\[(][^\])]*[\])]/g, "").replace(/\s+/g, " ").trim();
  console.log(`[voice] Scribe heard: "${raw}"${cleaned !== raw ? ` → cleaned: "${cleaned}"` : ""}`);
  dbg(`transcript raw="${raw}" cleaned="${cleaned}"`);
  return cleaned;
}
