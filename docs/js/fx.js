// Confetti celebrations. (The animated backdrop lives inside the 3D stage
// in board3d.js so it participates in the bloom pass.)

/* global confetti */

export function celebrateSolve() {
  const defaults = { ticks: 90, zIndex: 3000, gravity: 1.1 };
  confetti({
    ...defaults,
    particleCount: 120,
    spread: 75,
    startVelocity: 55,
    origin: { x: 0.5, y: 0.65 },
  });
  confetti({
    ...defaults,
    particleCount: 60,
    spread: 110,
    startVelocity: 40,
    scalar: 0.8,
    origin: { x: 0.5, y: 0.65 },
  });
}

export function celebrateBig(durationMs = 5000) {
  const end = Date.now() + durationMs;
  const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 3000 };
  const rand = (min, max) => Math.random() * (max - min) + min;

  const interval = setInterval(() => {
    const timeLeft = end - Date.now();
    if (timeLeft <= 0) return clearInterval(interval);
    const particleCount = 50 * (timeLeft / durationMs);
    confetti({
      ...defaults,
      particleCount,
      origin: { x: rand(0.1, 0.3), y: Math.random() - 0.2 },
    });
    confetti({
      ...defaults,
      particleCount,
      origin: { x: rand(0.7, 0.9), y: Math.random() - 0.2 },
    });
  }, 250);

  const rain = setInterval(() => {
    if (Date.now() > end) return clearInterval(rain);
    confetti({
      particleCount: 8,
      angle: 90,
      spread: 1000,
      origin: { x: Math.random(), y: -0.05 },
      ticks: 600,
      gravity: 3,
      startVelocity: 10,
      decay: 0.9,
      zIndex: 3000,
    });
  }, 100);
}
