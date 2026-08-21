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

export function isEnabled() {
  return !!getKey() && !!navigator.mediaDevices?.getUserMedia;
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
export function recordUtterance({ maxMs = 6500, silenceMs = 1200, onSpeech } = {}) {
  let resolveBlob;
  const blob = new Promise((res) => (resolveBlob = res));
  let recorder = null;
  let stream = null;
  let ctx = null;
  let rafId = 0;
  let maxTimer = 0;
  let cancelled = false;
  let spoke = false;

  const cleanup = () => {
    cancelAnimationFrame(rafId);
    clearTimeout(maxTimer);
    stream?.getTracks().forEach((t) => t.stop());
    ctx?.close().catch(() => {});
  };

  const finish = () => {
    if (recorder && recorder.state !== "inactive") recorder.stop();
    else resolveBlob(null);
  };

  (async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      resolveBlob(null);
      return;
    }
    if (cancelled) {
      cleanup();
      resolveBlob(null);
      return;
    }

    const chunks = [];
    recorder = new MediaRecorder(stream, { mimeType: pickMime() || undefined });
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = () => {
      cleanup();
      // No speech detected → nothing to transcribe (don't waste an API call).
      resolveBlob(
        cancelled || !spoke || !chunks.length
          ? null
          : new Blob(chunks, { type: recorder.mimeType })
      );
    };
    recorder.start();

    // Silence detection: wait for speech to start, then stop after a pause.
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let quietSince = 0;

    const watch = () => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      const now = performance.now();
      if (rms > 0.02) {
        if (!spoke) {
          spoke = true;
          onSpeech?.();
        }
        quietSince = now;
      } else if (spoke && now - quietSince > silenceMs) {
        finish();
        return;
      }
      rafId = requestAnimationFrame(watch);
    };
    rafId = requestAnimationFrame(watch);
    maxTimer = setTimeout(finish, maxMs);
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
export async function transcribe(blob) {
  const key = getKey();
  if (!key) throw new Error("no API key");
  const form = new FormData();
  form.append("model_id", "scribe_v1");
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
  return (data.text || "").trim();
}
