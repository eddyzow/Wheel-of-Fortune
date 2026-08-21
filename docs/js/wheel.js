// Procedurally drawn wheel with real spin physics and a flapping pointer.

import { rand } from "./util.js";

const STEP = (Math.PI * 2) / 24;

const cash = (value, color, text = "#fff") => ({
  type: "cash",
  value,
  label: "$" + value,
  color,
  text,
});

export const WEDGES = [
  { type: "cash", value: 2500, label: "$2500", color: "#7a1fa2", text: "#ffe066" },
  { type: "bankrupt", value: 0, label: "BANKRUPT", color: "#0a0a0a", text: "#fff" },
  cash(900, "#e53935"),
  cash(500, "#fdd835", "#111"),
  cash(650, "#1e88e5"),
  cash(500, "#f06292", "#111"),
  cash(800, "#fb8c00"),
  { type: "loseturn", value: 0, label: "LOSE A TURN", color: "#ececec", text: "#111" },
  cash(700, "#43a047"),
  { type: "freeplay", value: 500, label: "FREE PLAY", color: "#00b8a9", text: "#053" },
  cash(650, "#8e24aa"),
  { type: "bankrupt", value: 0, label: "BANKRUPT", color: "#0a0a0a", text: "#fff" },
  cash(600, "#e53935"),
  cash(500, "#29b6f6", "#111"),
  cash(550, "#fdd835", "#111"),
  cash(600, "#5e35b1"),
  { type: "million", value: 0, label: "MILLION", color: "#0f5132", text: "#d9f7e8" },
  cash(700, "#fb8c00"),
  cash(500, "#43a047"),
  cash(650, "#e53935"),
  cash(600, "#1e88e5"),
  cash(700, "#f06292", "#111"),
  cash(600, "#fdd835", "#111"),
  { type: "wildcard", value: 500, label: "WILD CARD", color: "#c2185b", text: "#ffe066" },
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

    // Generated textures; rebuild the face as each arrives.
    this.hubImg = new Image();
    this.hubImg.onload = () => {
      this.buildBase();
      this.dirty = true;
    };
    this.hubImg.src = "assets/textures/radial_brushed.png";
    this.grainImg = new Image();
    this.grainImg.onload = () => {
      this.buildBase();
      this.dirty = true;
    };
    this.grainImg.src = "assets/textures/wheel_grain.png";

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(canvas);
    this.resize();

    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  // Render the static wheel face once at high resolution.
  buildBase() {
    const S = 1400;
    const c = this.base;
    c.width = c.height = S;
    const g = c.getContext("2d");
    const R = S / 2;
    g.translate(R, R);
    g.rotate(-Math.PI / 2); // local angle 0 points up

    const rimOuter = R * 0.985;
    const rimInner = R * 0.94;
    const hubR = R * 0.16;

    for (let i = 0; i < 24; i++) {
      const w = WEDGES[i];
      const a0 = i * STEP - STEP / 2;
      const a1 = a0 + STEP;

      // Wedge fill with a subtle radial sheen
      const grad = g.createRadialGradient(0, 0, hubR, 0, 0, rimInner);
      grad.addColorStop(0, shade(w.color, 1.25));
      grad.addColorStop(0.55, w.color);
      grad.addColorStop(1, shade(w.color, 0.8));
      g.beginPath();
      g.moveTo(0, 0);
      g.arc(0, 0, rimInner, a0, a1);
      g.closePath();
      g.fillStyle = grad;
      g.fill();
      g.strokeStyle = "rgba(255,255,255,0.35)";
      g.lineWidth = 2;
      g.stroke();
    }

    // Radial-fiber grain over the wedge paint (before labels stay crisp).
    if (this.grainImg?.complete && this.grainImg.naturalWidth > 0) {
      g.save();
      g.rotate(Math.PI / 2); // grain image is orientation-agnostic
      g.drawImage(this.grainImg, -R, -R, R * 2, R * 2);
      g.restore();
    }

    for (let i = 0; i < 24; i++) {
      const w = WEDGES[i];
      const a0 = i * STEP - STEP / 2;

      // Label: characters stacked along the radius, rim → hub
      const mid = a0 + STEP / 2;
      g.save();
      g.rotate(mid);
      g.fillStyle = w.text;
      g.textAlign = "center";
      g.textBaseline = "middle";
      const chars = w.label.split("");
      const isSpecial = w.type !== "cash";
      const fs = isSpecial ? R * 0.062 : R * 0.085;
      g.font = `800 ${fs}px 'Roboto', 'IBM Plex Sans', sans-serif`;
      let r = rimInner - fs * 0.8;
      for (const ch of chars) {
        if (ch !== " ") {
          g.save();
          g.translate(r, 0);
          g.rotate(Math.PI / 2);
          g.fillText(ch, 0, 0);
          g.restore();
        }
        r -= ch === " " ? fs * 0.5 : fs * (isSpecial ? 0.92 : 1.0);
      }
      g.restore();
    }

    // Outer rim
    g.beginPath();
    g.arc(0, 0, (rimOuter + rimInner) / 2, 0, Math.PI * 2);
    g.lineWidth = rimOuter - rimInner;
    const rimGrad = g.createLinearGradient(-R, -R, R, R);
    rimGrad.addColorStop(0, "#3a3a44");
    rimGrad.addColorStop(0.5, "#9fa4b3");
    rimGrad.addColorStop(1, "#2c2c34");
    g.strokeStyle = rimGrad;
    g.stroke();

    // Pegs at wedge boundaries
    for (let i = 0; i < 24; i++) {
      const a = i * STEP - STEP / 2;
      const px = Math.cos(a) * rimInner * 0.985;
      const py = Math.sin(a) * rimInner * 0.985;
      const peg = g.createRadialGradient(px - 3, py - 3, 1, px, py, R * 0.014);
      peg.addColorStop(0, "#ffffff");
      peg.addColorStop(1, "#8a8f9c");
      g.beginPath();
      g.arc(px, py, R * 0.014, 0, Math.PI * 2);
      g.fillStyle = peg;
      g.fill();
    }

    // Hub: generated spun-metal disc when available, gradient fallback
    if (this.hubImg?.complete && this.hubImg.naturalWidth > 0) {
      g.save();
      g.beginPath();
      g.arc(0, 0, hubR, 0, Math.PI * 2);
      g.clip();
      g.drawImage(this.hubImg, -hubR, -hubR, hubR * 2, hubR * 2);
      // Darken toward the edge so it reads as recessed
      const shade2 = g.createRadialGradient(0, 0, hubR * 0.35, 0, 0, hubR);
      shade2.addColorStop(0, "rgba(0,0,0,0)");
      shade2.addColorStop(1, "rgba(0,0,0,0.55)");
      g.fillStyle = shade2;
      g.fillRect(-hubR, -hubR, hubR * 2, hubR * 2);
      g.restore();
    } else {
      const hubGrad = g.createRadialGradient(
        -hubR * 0.3,
        -hubR * 0.3,
        hubR * 0.1,
        0,
        0,
        hubR
      );
      hubGrad.addColorStop(0, "#4b515f");
      hubGrad.addColorStop(1, "#15171c");
      g.beginPath();
      g.arc(0, 0, hubR, 0, Math.PI * 2);
      g.fillStyle = hubGrad;
      g.fill();
    }
    g.beginPath();
    g.arc(0, 0, hubR, 0, Math.PI * 2);
    g.lineWidth = R * 0.012;
    g.strokeStyle = "#b9becb";
    g.stroke();
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

    if (this.dirty) {
      this.render();
      this.dirty = false;
    }
    requestAnimationFrame((t) => this.loop(t));
  }

  // Fake-3D projection: the wheel is a tilted disc (vertical squash) with an
  // extruded rim, a drop shadow, and studio lighting that stays fixed in
  // the world while the painted face rotates beneath it.
  render() {
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
