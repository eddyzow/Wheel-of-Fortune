// Small shared helpers: easing, randomness, timing.

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export const rand = (min, max) => Math.random() * (max - min) + min;
export const randInt = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// Generic rAF tween. Returns a promise; onUpdate receives eased t in [0,1].
// A timeout fallback completes it even if rAF is suspended (hidden tab).
export function animate(duration, onUpdate, ease = easeOutCubic) {
  return new Promise((resolve) => {
    const start = performance.now();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onUpdate(1, 1);
      resolve();
    };
    function frame(now) {
      if (done) return;
      const t = clamp((now - start) / duration, 0, 1);
      onUpdate(ease(t), t);
      if (t < 1) requestAnimationFrame(frame);
      else finish();
    }
    requestAnimationFrame(frame);
    setTimeout(finish, duration + 40);
  });
}

export const fmtMoney = (n) => "$" + n.toLocaleString("en-US");

// Edit distance, used to forgive small speech-to-text slips on spoken solves.
export function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[n];
}

// Damped-spring animation (underdamped values ring/overshoot naturally).
// Resolves when settled; a timeout fallback jumps to the end state if rAF
// is suspended. damping < 2*sqrt(stiffness) ⇒ overshoot.
export function springAnim({
  from = 0,
  to = 1,
  velocity = 0,
  stiffness = 170,
  damping = 14,
  onUpdate,
  maxMs = 2000,
}) {
  return new Promise((resolve) => {
    let x = from;
    let v = velocity;
    let last = performance.now();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onUpdate(to);
      resolve();
    };
    function frame(now) {
      if (done) return;
      let dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      // Fixed-step integration for stability.
      while (dt > 0) {
        const h = Math.min(dt, 1 / 240);
        const a = -stiffness * (x - to) - damping * v;
        v += a * h;
        x += v * h;
        dt -= h;
      }
      onUpdate(x);
      if (Math.abs(x - to) < 0.001 && Math.abs(v) < 0.01) finish();
      else requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    setTimeout(finish, maxMs);
  });
}
