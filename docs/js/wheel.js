// Procedurally drawn wheel with real spin physics and a flapping pointer.

import { rand } from "./util.js";

const STEP = (Math.PI * 2) / 24;

const cash = (value, color) => ({
  type: "cash",
  value,
  label: "$" + value,
  color,
});

// Bright print-style palette matching the real wheel's art.
export const WEDGES = [
  cash(2500, "#3fa3e8"),
  { type: "bankrupt", value: 0, label: "BANKRUPT", color: "#0d0d0d" },
  cash(900, "#f2882d"),
  cash(500, "#f7d648"),
  cash(650, "#ef9fb0"),
  cash(500, "#9059c8"),
  cash(800, "#e63e30"),
  { type: "loseturn", value: 0, label: "LOSE A TURN", color: "#f2ede1" },
  cash(700, "#f7d648"),
  { type: "freeplay", value: 500, label: "FREE PLAY", color: "#56d8de" },
  cash(650, "#47b258"),
  { type: "bankrupt", value: 0, label: "BANKRUPT", color: "#0d0d0d" },
  cash(600, "#ef9fb0"),
  cash(500, "#62b8e8"),
  cash(550, "#9059c8"),
  cash(600, "#f2882d"),
  { type: "million", value: 0, label: "MILLION", color: "#0d0d0d" },
  cash(700, "#f7d648"),
  cash(500, "#e63e30"),
  cash(650, "#a58ce0"),
  cash(600, "#47b258"),
  cash(700, "#62b8e8"),
  cash(600, "#e63e30"),
  { type: "wildcard", value: 500, label: "WILD CARD", color: "#47b258" },
];

export class Wheel {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.theta = 0; // current wheel rotation (rad, clockwise)
    this.omega = 0;
    this.deflect = 0; // pointer flap angle
    this.deflectV = 0; // pointer angular velocity (spring state)
    this.spinning = false;
    this.dirty = true;
    this.lastPegIndex = null;

    this.base = document.createElement("canvas");
    this.buildBase();

    // Rebuild once the display font is ready so the digits rasterize bold.
    document.fonts?.ready?.then(() => {
      this.buildBase();
      this.dirty = true;
    });
    // Codex-generated print textures: hub center + wedge material overlay.
    this.hubImg = new Image();
    this.hubImg.onload = () => {
      this.buildBase();
      this.dirty = true;
    };
    this.hubImg.src = "assets/textures/hub_center.png";
    this.printImg = new Image();
    this.printImg.onload = () => {
      this.buildBase();
      this.dirty = true;
    };
    this.printImg.src = "assets/textures/wedge_print.png";

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(canvas);
    this.resize();

    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  // Render the static wheel face once at high resolution.
  // Flat print-style art like the real wheel: bright solid wedges, a big
  // plain teal hub, and huge black digits with white outlines + shadows.
  buildBase() {
    const S = 1600;
    const c = this.base;
    c.width = c.height = S;
    const g = c.getContext("2d");
    const R = S / 2;
    g.translate(R, R);
    g.rotate(-Math.PI / 2); // local angle 0 points up

    const edge = R * 0.995;
    const borderW = R * 0.03; // gold border ring width
    const faceEdge = edge - borderW;
    const hubR = R * 0.44;
    const FONT = "'Plus Jakarta Sans', 'Roboto', sans-serif";

    // Flat wedge fills
    for (let i = 0; i < 24; i++) {
      const w = WEDGES[i];
      const a0 = i * STEP - STEP / 2;
      const a1 = a0 + STEP;
      g.beginPath();
      g.moveTo(0, 0);
      g.arc(0, 0, edge, a0, a1);
      g.closePath();
      g.fillStyle = w.color;
      g.fill();
    }

    // Printed-material overlay (Codex texture: sparkles + fiber streaks)
    if (this.printImg?.complete && this.printImg.naturalWidth > 0) {
      g.save();
      g.rotate(Math.PI / 2);
      g.drawImage(this.printImg, -R, -R, R * 2, R * 2);
      g.restore();
    }

    // One glyph with shadow, outline, fill — used by the stack drawer.
    const glyph = (ch, r, tangent, fs, fill, stroke) => {
      g.save();
      g.translate(r, tangent);
      g.rotate(Math.PI / 2);
      g.font = `800 ${fs}px ${FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = "rgba(0,0,0,0.4)";
      g.fillText(ch, fs * 0.07, fs * 0.07);
      if (stroke) {
        g.lineWidth = fs * 0.14;
        g.lineJoin = "round";
        g.strokeStyle = stroke;
        g.strokeText(ch, 0, 0);
      }
      g.fillStyle = fill;
      g.fillText(ch, 0, 0);
      g.restore();
    };

    // Character stack centered radially between the hub and the border.
    const drawStacked = (label, mid, fs, fill, stroke, tight) => {
      const stepLen = (ch) => (ch === " " ? fs * 0.4 : fs * (tight ? 0.97 : 0.9));
      let stackLen = fs * 0.85; // first glyph's own height allowance
      for (let i = 1; i < label.length; i++) stackLen += stepLen(label[i]);
      const outer = faceEdge - fs * 0.35;
      const inner = hubR + fs * 0.35;
      let r = outer - Math.max(0, outer - inner - stackLen) / 2 - fs * 0.45;
      g.save();
      g.rotate(mid);
      for (const ch of label) {
        if (ch !== " ") glyph(ch, r, 0, fs, fill, stroke);
        r -= stepLen(ch);
      }
      g.restore();
      return outer; // where the stack started (for the $ badge)
    };

    for (let i = 0; i < 24; i++) {
      const w = WEDGES[i];
      const mid = i * STEP;
      if (w.type === "cash") {
        // Digits only in the stack; the $ sits beside the top digit,
        // smaller — like the show's wheel art.
        const digits = String(w.value);
        const fs = digits.length > 3 ? R * 0.112 : R * 0.128;
        drawStacked(digits, mid, fs, "#101010", "#ffffff", true);
        g.save();
        g.rotate(mid);
        glyph("$", faceEdge - fs * 0.72, -fs * 0.62, fs * 0.52, "#101010", "#ffffff");
        g.restore();
      } else if (w.type === "bankrupt") {
        drawStacked("BANKRUPT", mid, R * 0.063, "#ffffff", null, false);
      } else if (w.type === "loseturn") {
        drawStacked("LOSE A TURN", mid, R * 0.055, "#101010", null, false);
      } else if (w.type === "freeplay") {
        drawStacked("FREE PLAY", mid, R * 0.058, "#101010", "#fff9d6", false);
      } else if (w.type === "million") {
        drawStacked("MILLION", mid, R * 0.066, "#57e85e", null, false);
      } else if (w.type === "wildcard") {
        drawStacked("WILD", mid, R * 0.085, "#e6399b", "#ffffff", false);
      }
    }

    // Gold border ring around the face
    const ring = g.createLinearGradient(-R, -R, R, R);
    ring.addColorStop(0, "#8a6a1c");
    ring.addColorStop(0.35, "#e8c56a");
    ring.addColorStop(0.65, "#b08a34");
    ring.addColorStop(1, "#6f5416");
    g.beginPath();
    g.arc(0, 0, edge - borderW / 2, 0, Math.PI * 2);
    g.lineWidth = borderW;
    g.strokeStyle = ring;
    g.stroke();
    g.beginPath();
    g.arc(0, 0, faceEdge, 0, Math.PI * 2);
    g.lineWidth = R * 0.004;
    g.strokeStyle = "rgba(0,0,0,0.45)";
    g.stroke();

    // Pegs at wedge boundaries
    for (let i = 0; i < 24; i++) {
      const a = i * STEP - STEP / 2;
      const px = Math.cos(a) * edge * 0.965;
      const py = Math.sin(a) * edge * 0.965;
      const peg = g.createRadialGradient(px - 3, py - 3, 1, px, py, R * 0.013);
      peg.addColorStop(0, "#ffffff");
      peg.addColorStop(1, "#8a8f9c");
      g.beginPath();
      g.arc(px, py, R * 0.013, 0, Math.PI * 2);
      g.fillStyle = peg;
      g.fill();
    }

    // Hub: Codex-generated laminate disc, flat teal fallback
    if (this.hubImg?.complete && this.hubImg.naturalWidth > 0) {
      g.drawImage(this.hubImg, -hubR, -hubR, hubR * 2, hubR * 2);
    } else {
      g.beginPath();
      g.arc(0, 0, hubR, 0, Math.PI * 2);
      g.fillStyle = "#2f9377";
      g.fill();
      const hubEdge = g.createRadialGradient(0, 0, hubR * 0.82, 0, 0, hubR);
      hubEdge.addColorStop(0, "rgba(0,0,0,0)");
      hubEdge.addColorStop(1, "rgba(0,0,0,0.22)");
      g.beginPath();
      g.arc(0, 0, hubR, 0, Math.PI * 2);
      g.fillStyle = hubEdge;
      g.fill();
    }
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.dirty = true;
  }

  // The wedge currently under the pointer (top of the wheel).
  landedIndex() {
    const TWO_PI = Math.PI * 2;
    const local = (((-this.theta) % TWO_PI) + TWO_PI) % TWO_PI;
    return Math.floor(((local + STEP / 2) % TWO_PI) / STEP);
  }

  // Friction model: dω/dt = -(K·ω + C). Solved in closed form so the spin
  // is a pure function of wall-clock time (immune to rAF throttling).
  spin() {
    if (this.spinning) return Promise.reject(new Error("already spinning"));
    // Tuned so a spin runs ~4.2-5.0s (the spin sample fades out on stop).
    const K = 0.48;
    const C = 0.65;
    const OMEGA_STOP = 0.12;
    const omega0 = rand(9.5, 14.5);
    const A = omega0 + C / K;

    const duration = Math.log(A / (OMEGA_STOP + C / K)) / K; // seconds
    const thetaAt = (t) =>
      this.spinStartTheta + (A * (1 - Math.exp(-K * t)) - C * t) / K;
    const omegaAt = (t) => A * Math.exp(-K * t) - C / K;

    this.spinning = true;
    // TV camera move: the wheel rises and grows while it spins.
    this.canvas.parentElement?.classList.add("spinning");
    this.spinStartTheta = this.theta;
    this.spinStartTime = performance.now();
    this.spinDuration = duration;
    this.thetaAt = thetaAt;
    this.omegaAt = omegaAt;

    // Precompute the final resting angle, nudged off exact wedge boundaries.
    let thetaEnd = thetaAt(duration);
    const TWO_PI = Math.PI * 2;
    const local = (((-thetaEnd) % TWO_PI) + TWO_PI) % TWO_PI;
    const inWedge = (local + STEP / 2) % STEP;
    if (inWedge < 0.02) thetaEnd -= 0.025;
    else if (inWedge > STEP - 0.02) thetaEnd += 0.025;
    this.spinEndTheta = thetaEnd;

    return new Promise((resolve) => {
      const finalize = () => {
        if (!this.spinning) return;
        this.spinning = false;
        this.canvas.parentElement?.classList.remove("spinning");
        this.theta = this.spinEndTheta;
        this.dirty = true;
        resolve(WEDGES[this.landedIndex()]);
      };
      this.finalizeSpin = finalize;
      // Fallback in case rAF is suspended (hidden tab).
      setTimeout(finalize, duration * 1000 + 60);
    });
  }

  loop(now) {
    this.lastTime = now;
    const dt = 1 / 60;

    if (this.spinning) {
      const t = (now - this.spinStartTime) / 1000;
      if (t >= this.spinDuration) {
        this.finalizeSpin?.();
      } else {
        const prevBoundary = Math.floor((this.theta + STEP / 2) / STEP);
        this.theta = this.thetaAt(t);
        const omega = this.omegaAt(t);
        const newBoundary = Math.floor((this.theta + STEP / 2) / STEP);
        if (newBoundary !== prevBoundary) {
          // Peg strike = velocity impulse into the pointer spring.
          // (No synthesized tick — the classic spin.mp3 carries the audio.)
          this.deflectV += 7 + omega * 0.6;
        }
      }
      this.dirty = true;
    }

    // Underdamped pointer spring — it snaps past center and rings.
    if (Math.abs(this.deflect) > 0.0005 || Math.abs(this.deflectV) > 0.005) {
      const a = -1300 * this.deflect - 22 * this.deflectV;
      this.deflectV += a * dt;
      this.deflect += this.deflectV * dt;
      this.deflect = Math.max(-0.65, Math.min(0.65, this.deflect));
      this.dirty = true;
    } else if (this.deflect !== 0) {
      this.deflect = 0;
      this.deflectV = 0;
      this.dirty = true;
    }

    // Always render: the wheel carries live lighting (sparkles, sheen,
    // chasing border bulbs) even at rest.
    this.render(now / 1000);
    requestAnimationFrame((t) => this.loop(t));
  }

  // Fake-3D projection: the wheel is a tilted disc (vertical squash) with an
  // extruded rim, a drop shadow, and studio lighting that stays fixed in
  // the world while the painted face rotates beneath it.
  render(time = 0) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    if (!W) return;
    const H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);

    const cx = W / 2;
    const R = W * 0.485;
    const s = 0.58; // tilt squash (camera looks across the wheel)
    const depth = W * 0.03; // rim thickness
    const cy = H * 0.07 + R * s;

    // 1. Drop shadow under the wheel
    ctx.save();
    ctx.translate(cx, cy + depth * 2.6);
    ctx.scale(1, s);
    const sh = ctx.createRadialGradient(0, 0, R * 0.75, 0, 0, R * 1.18);
    sh.addColorStop(0, "rgba(0,0,0,0.5)");
    sh.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 2. Extruded rim side (dark metal band below the face)
    ctx.save();
    ctx.translate(cx, cy + depth);
    ctx.scale(1, s);
    const side = ctx.createLinearGradient(-R, 0, R, 0);
    side.addColorStop(0, "#14161c");
    side.addColorStop(0.5, "#3a3f4c");
    side.addColorStop(1, "#111318");
    ctx.fillStyle = side;
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.002, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 3. Painted face, rotated under the squash (true disc projection)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, s);
    ctx.rotate(this.theta);
    ctx.drawImage(this.base, -R, -R, R * 2, R * 2);
    ctx.restore();

    // 4. Fixed studio lighting (doesn't rotate with the wheel)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, s);
    // Ambient occlusion where the face meets the rim
    const ao = ctx.createRadialGradient(0, 0, R * 0.84, 0, 0, R);
    ao.addColorStop(0, "rgba(0,0,0,0)");
    ao.addColorStop(1, "rgba(0,0,0,0.30)");
    ctx.fillStyle = ao;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();
    // Key-light sheen from the top
    const sheen = ctx.createRadialGradient(0, -R * 0.6, R * 0.1, 0, -R * 0.45, R * 1.05);
    sheen.addColorStop(0, "rgba(255,250,235,0.13)");
    sheen.addColorStop(0.55, "rgba(255,250,235,0.04)");
    sheen.addColorStop(1, "rgba(255,250,235,0)");
    ctx.fillStyle = sheen;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();
    // Lower shade
    const shade2 = ctx.createRadialGradient(0, R * 0.8, R * 0.2, 0, R * 0.7, R * 1.1);
    shade2.addColorStop(0, "rgba(0,0,10,0.30)");
    shade2.addColorStop(1, "rgba(0,0,10,0)");
    ctx.fillStyle = shade2;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();
    // Crisp specular arc along the upper rim
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.lineWidth = R * 0.022;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.972, -2.15, -0.99);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = R * 0.009;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.972, -1.9, -1.25);
    ctx.stroke();

    // --- Live lighting (animated even at rest) ---
    // Rotating sheen: a soft bright sector sweeping around the face
    const sweepA = time * 0.3;
    const sheenGrad = ctx.createRadialGradient(0, 0, R * 0.44, 0, 0, R * 0.97);
    sheenGrad.addColorStop(0, "rgba(255,255,255,0)");
    sheenGrad.addColorStop(0.6, "rgba(255,255,255,0.09)");
    sheenGrad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, R * 0.97, sweepA, sweepA + 0.85);
    ctx.closePath();
    ctx.fillStyle = sheenGrad;
    ctx.fill();

    // Twinkle sparkles: little 4-point glints popping across the wedges
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineCap = "round";
    for (let i = 0; i < 15; i++) {
      const cycle = Math.floor(time * 0.8 + i * 0.617);
      const h = Math.sin(i * 127.1 + cycle * 311.7) * 43758.5453;
      const rnd = (k) => {
        const x = Math.sin(h + k * 91.7) * 24634.6345;
        return x - Math.floor(x);
      };
      const ang = rnd(1) * Math.PI * 2;
      const rad = R * (0.48 + 0.45 * rnd(2));
      const phase = (time * 0.8 + i * 0.617) % 1;
      const a = Math.sin(phase * Math.PI); // fade in-out
      if (a < 0.05) continue;
      const sx = Math.cos(ang) * rad;
      const sy = Math.sin(ang) * rad;
      const len = R * (0.012 + 0.02 * rnd(3)) * a;
      ctx.globalAlpha = a * 0.85;
      ctx.lineWidth = R * 0.005;
      ctx.beginPath();
      ctx.moveTo(sx - len, sy);
      ctx.lineTo(sx + len, sy);
      ctx.moveTo(sx, sy - len);
      ctx.lineTo(sx, sy + len);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Chasing bulbs around the gold border
    const NB = 48;
    for (let i = 0; i < NB; i++) {
      const a = (i / NB) * Math.PI * 2;
      const b = Math.max(0, Math.sin(a * 4 + time * 5));
      const bx = Math.cos(a) * R * 0.982;
      const by = Math.sin(a) * R * 0.982;
      ctx.beginPath();
      ctx.arc(bx, by, R * 0.0085, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,${215 + Math.round(35 * b)},${140 + Math.round(90 * b)},${0.25 + 0.75 * b})`;
      ctx.fill();
    }
    ctx.restore();

    // Pointer (flapper) above the wheel top
    const px = cx;
    const py = cy - R * s - W * 0.004;
    const len = W * 0.055;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(this.deflect);
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = W * 0.012;
    ctx.shadowOffsetY = W * 0.006;
    const grad = ctx.createLinearGradient(-len * 0.2, 0, len * 0.2, 0);
    grad.addColorStop(0, "#ffe680");
    grad.addColorStop(0.5, "#ffc107");
    grad.addColorStop(1, "#b8860b");
    ctx.fillStyle = grad;
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-len * 0.28, -len * 0.35);
    ctx.lineTo(len * 0.28, -len * 0.35);
    ctx.lineTo(0, len * 0.85);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -len * 0.35, len * 0.16, 0, Math.PI * 2);
    ctx.fillStyle = "#fff3cd";
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

// Lighten/darken a hex color by a factor.
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `rgb(${r},${g},${b})`;
}
