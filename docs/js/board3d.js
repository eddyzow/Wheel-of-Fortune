// Full-screen 3D stage: starfield shader backdrop, realistic puzzle board
// with physical materials + generated textures, chase lights, and an
// UnrealBloom pass so emissive surfaces actually glow.
//
// The board is framed into a DOM-driven sub-rectangle of the screen via
// camera.setViewOffset, so HTML layout decides where the board sits and
// nothing overlaps.

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ROW_LENGTHS } from "./puzzles.js";
import { delay } from "./util.js";

const TILE_W = 1;
const TILE_H = 1.3;
const TILE_D = 0.09;
const GAP = 0.14; // black grid lines show between tiles, like the show
// Gold pill set piece dimensions (world units); tools/gen_textures.py uses
// the same capsule proportions (seg = 0.27·W, radius = 0.45·H, and the
// capsule fits fully inside the texture).
const GOLD_W = 24.5;
const GOLD_H = 12.6;
// Full pill extents (used by the camera fit so the ends never clip).
const PILL_HALF_W = 0.495 * GOLD_W;
const PILL_HALF_H = 0.45 * GOLD_H;
const PITCH_X = TILE_W + GAP;
const PITCH_Y = TILE_H + GAP;

// Light-ring fragment shader. u = position along the loop (0..1, clockwise
// from the top-left); HDR colors above the bloom threshold so the ring glows.
const NEON_FRAG = `
uniform float uTime;
uniform float uMode;
uniform float uModeT;
uniform float uFlash;
uniform float uFlashT;
uniform float uFlashDur;
uniform float uGain;
varying vec2 vUv;

const vec3 ROYAL = vec3(0.03, 0.17, 0.95);
const vec3 LIGHT = vec3(0.35, 0.78, 1.0);
const vec3 WHITE = vec3(1.0, 1.0, 1.0);
const vec3 GREEN = vec3(0.03, 0.82, 0.15);
const vec3 RED   = vec3(1.0, 0.08, 0.06);
const vec3 GOLD  = vec3(1.0, 0.72, 0.16);
const float TAU = 6.2831853;

void main() {
  float u = vUv.x;
  float t = uTime;

  // --- base mode ---
  float m = floor(uMode + 0.5);
  vec3 col = ROYAL * (0.9 + 0.1 * sin(t * 1.6));
  if (m == 1.0) {
    // Toss-up: a few broad light-blue / royal-blue sections, smoothly
    // blended, rolling counter-clockwise around the board
    float wave = 0.5 + 0.5 * sin((u * 4.0 + t * 0.38) * TAU);
    col = mix(ROYAL, LIGHT, wave);
  } else if (m == 2.0) {
    // Buzzed in: chase freezes to a bright steady light blue
    col = LIGHT * (0.94 + 0.06 * sin(t * 6.0));
  } else if (m == 3.0) {
    // Hurry (bonus clock): quicker blended white/blue roll
    float wave = 0.5 + 0.5 * sin((u * 6.0 + t * 0.9) * TAU);
    col = mix(ROYAL, WHITE, wave * 0.85);
  } else if (m == 4.0) {
    // Celebrate: gold/white roll
    float wave = 0.5 + 0.5 * sin((u * 5.0 - t * 0.7) * TAU);
    col = mix(GOLD, WHITE, wave * 0.7);
  }

  // --- transient flash overlay ---
  if (uFlash > 0.5) {
    float p = clamp((t - uFlashT) / uFlashDur, 0.0, 1.0);
    float env = 1.0 - smoothstep(0.62, 1.0, p);
    if (uFlash < 1.5) {
      // Solved: green with a gentle pulse, held, then eased back to blue
      float pulse = 0.78 + 0.22 * sin((t - uFlashT) * TAU * 1.6);
      col = mix(col, GREEN * pulse, env);
    } else if (uFlash < 2.5) {
      // Puzzle revealed: solid white that cross-fades to green (no sections)
      vec3 wg = mix(WHITE, GREEN, smoothstep(0.12, 0.5, p));
      col = mix(col, wg, env);
    } else if (uFlash < 3.5) {
      // Good guess: a broad soft white wave rolls once around (counter-clockwise)
      float d = abs(fract(u + p + 0.5) - 0.5);
      col = mix(col, WHITE, exp(-d * d * 45.0) * 0.85 * (1.0 - p * 0.35));
    } else if (uFlash < 4.5) {
      // Wrong: quick red blinks
      float blink = step(0.5, fract((t - uFlashT) * 6.0));
      col = mix(col, RED, blink * env);
    } else {
      // Bankrupt: red sweep over a dimmed ring
      float d = abs(fract(u - p * 2.0 + 0.5) - 0.5);
      col = mix(col * 0.35, RED, exp(-d * d * 80.0)) * env + col * (1.0 - env);
    }
  }
  gl_FragColor = vec4(col * uGain, 1.0);
}
`;


export class Board3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.tiles = new Map();
    this.letterTextures = new Map();
    this.glowColor = null;
    this.glowPhase = 0;
    this.region = null; // CSS-pixel rect the board should occupy

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(31, 1, 0.1, 200);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    // Post-processing: render → bloom → output (tone map + srgb)
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // Threshold sits above lit-white radiance (~1.2-1.6) so only true HDR
    // emitters bloom: chase bulbs at peak, blue reveal tiles, glints.
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(1, 1),
      0.32, // strength — a soft halo, not a haze
      0.4, // radius
      2.0 // threshold
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.buildMaterials();
    this.loadTextures();
    this.buildBackdrop();
    this.buildFrame();
    this.buildTiles();
    this.buildBulbs();
    this.buildGlow();
    this.buildLights();

    window.addEventListener("resize", () => this.resize());
    this.resize();

    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  // The DOM tells us where the board belongs (CSS pixels).
  setRegion(rect) {
    this.region = rect;
    this.resize();
  }

  // --- Examine mode: free-look orbit around the board ---
  setExamine(on) {
    if (on) {
      this.examine = {
        yaw: 0, pitch: -0.1, dist: 1.15,
        tYaw: 0.35, tPitch: 0.06, tDist: 0.8, // gentle intro drift
      };
      if (!this.examineWired) {
        this.examineWired = true;
        const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
        window.addEventListener("pointerdown", (e) => {
          if (!this.examine) return;
          if (e.target.closest("button, input, .modal")) return;
          this.examineDrag = { x: e.clientX, y: e.clientY };
        });
        window.addEventListener("pointermove", (e) => {
          if (!this.examine || !this.examineDrag) return;
          const ex = this.examine;
          ex.tYaw = clamp(ex.tYaw - (e.clientX - this.examineDrag.x) * 0.005, -1.15, 1.15);
          ex.tPitch = clamp(ex.tPitch + (e.clientY - this.examineDrag.y) * 0.004, -0.45, 0.6);
          this.examineDrag = { x: e.clientX, y: e.clientY };
        });
        window.addEventListener("pointerup", () => (this.examineDrag = null));
        window.addEventListener(
          "wheel",
          (e) => {
            if (!this.examine) return;
            const ex = this.examine;
            ex.tDist = clamp(ex.tDist * (1 + e.deltaY * 0.0012), 0.3, 1.7);
          },
          { passive: true }
        );
      }
    } else if (this.examine) {
      this.examine = null;
      this.examineDrag = null;
      // Glide back to the home framing.
      this.camAnim = {
        t0: performance.now(),
        dur: 1100,
        from: {
          x: this.camera.position.x,
          y: this.camera.position.y,
          z: this.camera.position.z,
        },
      };
    }
  }

  // Attach generated textures to materials only once they actually load,
  // so a missing file degrades to the flat-color look instead of black.
  // Resolves when the key textures are in (or failed) — drives the loader.
  whenReady() {
    return Promise.all(this.assetPromises || []);
  }

  trackLoad(file, loadFn) {
    this.assetPromises = this.assetPromises || [];
    this.assetPromises.push(
      new Promise((resolve) => loadFn(resolve)).catch(() => {})
    );
  }

  loadTextures() {
    const loader = new THREE.TextureLoader();
    const attach = (file, slot, { repeat = null, onLoad = null } = {}, targets) => {
      this.trackLoad(file, (done) =>
      loader.load(
        `assets/textures/${file}`,
        (t) => {
          // Only albedo is sRGB; data maps (normal/roughness) stay linear.
          t.colorSpace = slot === "map" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          if (repeat) {
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
            t.repeat.set(repeat[0], repeat[1]);
          }
          t.anisotropy = 8;
          for (const mat of targets()) {
            mat[slot] = t;
            mat.needsUpdate = true;
          }
          onLoad?.(t);
          done();
        },
        undefined,
        () => done()
      ));
    };

    attach(
      "tile_empty.png",
      "map",
      { onLoad: () => this.matEmpty.color.set(0xffffff) },
      () => [this.matEmpty]
    );
    attach(
      "tile_face.png",
      "map",
      { onLoad: () => this.matBlank.color.set(0xffffff) },
      () => [this.matBlank]
    );

    // Face image reused as the letter-tile background (canvas composite).
    this.tileFaceImg = new Image();
    this.tileFaceImg.src = "assets/textures/tile_face.png";
  }

  buildMaterials() {
    // Tile faces are UNLIT (shading is baked into the textures) so they
    // stay crisp and saturated like the show's graphics — scene lighting
    // was washing them into gray-green plastic.
    this.matEmpty = new THREE.MeshBasicMaterial({ color: 0x1e7c40 });
    this.matBlank = new THREE.MeshBasicMaterial({ color: 0xf4f6f0 });
    // Deep show-blue reveal flash: saturated, just over the bloom
    // threshold in the blue channel for a soft halo — not a white blast.
    this.matBlue = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.matBlue.color.setRGB(0.12, 0.32, 2.6);

    this.matSide = new THREE.MeshStandardMaterial({
      color: 0x14171c, // dark tile edges disappear into the black grid
      roughness: 0.5,
      metalness: 0.6,
      envMapIntensity: 0.5,
    });
    // Black face plate the tiles are set into — piano-black gloss so the
    // bevels catch real reflections.
    this.matPanel = new THREE.MeshStandardMaterial({
      color: 0x0a0d10,
      roughness: 0.28,
      metalness: 0.6,
      envMapIntensity: 0.9,
    });
    // Polished chrome — smooth mirror finish, no brushed texture.
    this.matTrim = new THREE.MeshStandardMaterial({
      color: 0xd6dbe4,
      roughness: 0.07,
      metalness: 1.0,
      envMapIntensity: 1.5,
    });
  }

  buildBackdrop() {
    // Static flat studio backdrop (generated: tools/gen_backdrop.py).
    // scene.background renders in screen space, so it never moves with
    // the camera and always covers the whole frame.
    this.trackLoad("studio_backdrop.png", (done) =>
      new THREE.TextureLoader().load(
        "assets/textures/studio_backdrop.png",
        (map) => {
          map.colorSpace = THREE.SRGBColorSpace;
          this.scene.background = map;
          done();
        },
        undefined,
        () => {
          this.scene.background = new THREE.Color(0x05070f);
          done();
        }
      )
    );

    // Gold sunburst set piece behind the board, like the show's surround.
    this.trackLoad("gold_sunburst.png", (done) =>
    new THREE.TextureLoader().load(
      "assets/textures/gold_sunburst.png",
      (map) => {
        done();
        map.colorSpace = THREE.SRGBColorSpace;
        const gold = new THREE.Mesh(
          new THREE.PlaneGeometry(GOLD_W, GOLD_H),
          new THREE.MeshBasicMaterial({
            map,
            transparent: true,
            depthWrite: false,
          })
        );
        gold.position.set(0, 0, -2.6);
        this.scene.add(gold);
      },
      undefined,
      () => done()
    ));
  }

  rowY(row) {
    return (1.5 - row) * PITCH_Y;
  }

  // One continuous stepped wall (rows 1-2 wide, rows 0 and 3 narrow).
  steppedShape(margin) {
    const A = (ROW_LENGTHS[0] * PITCH_X) / 2 + margin; // narrow half-width
    const B = (ROW_LENGTHS[1] * PITCH_X) / 2 + margin; // wide half-width
    const yT = this.rowY(0) + PITCH_Y / 2 + margin;
    const y1 = this.rowY(0) - PITCH_Y / 2 + margin;
    const y2 = this.rowY(2) - PITCH_Y / 2 - margin;
    const yB = this.rowY(3) - PITCH_Y / 2 - margin;
    const s = new THREE.Shape();
    s.moveTo(-A, yT);
    s.lineTo(A, yT);
    s.lineTo(A, y1);
    s.lineTo(B, y1);
    s.lineTo(B, y2);
    s.lineTo(A, y2);
    s.lineTo(A, yB);
    s.lineTo(-A, yB);
    s.lineTo(-A, y2);
    s.lineTo(-B, y2);
    s.lineTo(-B, y1);
    s.lineTo(-A, y1);
    s.closePath();
    return s;
  }

  // Flat light band following the stepped outline: crisp mitred corners,
  // exact width. uv.x = position along the loop (0..1) for the shader.
  lightBandGeometry(margin, width) {
    const inner = this.steppedOutlinePoints(margin - width / 2, 0);
    const outer = this.steppedOutlinePoints(margin + width / 2, 0);
    const n = inner.length;
    // cumulative length along the centerline for u
    const center = this.steppedOutlinePoints(margin, 0);
    const lens = [0];
    for (let i = 0; i < n; i++) {
      const a = center[i], b = center[(i + 1) % n];
      lens.push(lens[i] + a.distanceTo(b));
    }
    const total = lens[n];
    const pos = [];
    const uv = [];
    const idx = [];
    for (let i = 0; i <= n; i++) {
      const k = i % n;
      const u = lens[i] / total; // i === n → u = 1 (closing seam)
      pos.push(inner[k].x, inner[k].y, 0, outer[k].x, outer[k].y, 0);
      uv.push(u, 0, u, 1);
    }
    for (let i = 0; i < n; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, c, b, b, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    return geo;
  }

  // Points of the stepped outline (used for the neon tube path).
  steppedOutlinePoints(margin, z) {
    const A = (ROW_LENGTHS[0] * PITCH_X) / 2 + margin;
    const B = (ROW_LENGTHS[1] * PITCH_X) / 2 + margin;
    const yT = this.rowY(0) + PITCH_Y / 2 + margin;
    const y1 = this.rowY(0) - PITCH_Y / 2 + margin;
    const y2 = this.rowY(2) - PITCH_Y / 2 - margin;
    const yB = this.rowY(3) - PITCH_Y / 2 - margin;
    return [
      [-A, yT], [A, yT], [A, y1], [B, y1], [B, y2], [A, y2],
      [A, yB], [-A, yB], [-A, y2], [-B, y2], [-B, y1], [-A, y1],
    ].map(([x, y]) => new THREE.Vector3(x, y, z));
  }

  buildFrame() {
    // Black face plate the tiles are set into (the show board's face is a
    // black grid, not colored).
    const face = new THREE.Mesh(
      new THREE.ExtrudeGeometry(this.steppedShape(0.68), {
        depth: 0.34,
        bevelEnabled: true,
        bevelThickness: 0.05,
        bevelSize: 0.05,
        bevelSegments: 2,
      }),
      this.matPanel
    );
    face.position.z = -0.45;
    face.receiveShadow = true;
    face.castShadow = true;
    this.scene.add(face);

    // Chrome rim around the plate — wide enough to read as a metal frame.
    const rim = new THREE.Mesh(
      new THREE.ExtrudeGeometry(this.steppedShape(1.08), {
        depth: 0.2,
        bevelEnabled: true,
        bevelThickness: 0.06,
        bevelSize: 0.06,
        bevelSegments: 3,
      }),
      this.matTrim
    );
    rim.position.z = -0.62;
    rim.receiveShadow = true;
    rim.castShadow = true;
    this.scene.add(rim);

    // Neon light ring: ONE tube whose color along the loop is computed in a
    // shader from a base MODE (idle blue, toss-up chase, buzzed, hurry,
    // celebrate) plus transient FLASHES (reveal, solved, good/bad guess,
    // bankrupt) — modelled on the real board's light behaviour.
    this.neonUniforms = {
      uTime: { value: 0 },
      uMode: { value: 0 },
      uModeT: { value: 0 },
      uFlash: { value: 0 },
      uFlashT: { value: 0 },
      uFlashDur: { value: 1 },
    };
    const NEON_VERT = `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`;
    // Main bar: LDR saturated colors (like real LEDs) — kept below the
    // range where ACES tone mapping would wash them toward white.
    this.matNeon = new THREE.ShaderMaterial({
      uniforms: { ...this.neonUniforms, uGain: { value: 1.0 } },
      vertexShader: NEON_VERT,
      fragmentShader: NEON_FRAG,
    });
    // Flat light band (~1/5 tile wide) with crisp corners, like the show.
    const ring = new THREE.Mesh(this.lightBandGeometry(0.44, 0.2), this.matNeon);
    ring.position.z = -0.02;
    this.scene.add(ring);
    // Soft additive halo around the bar — the glow, in the bar's own color.
    this.matNeonHalo = new THREE.ShaderMaterial({
      uniforms: { ...this.neonUniforms, uGain: { value: 0.16 } },
      vertexShader: NEON_VERT,
      fragmentShader: NEON_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const halo = new THREE.Mesh(this.lightBandGeometry(0.44, 0.62), this.matNeonHalo);
    halo.position.z = -0.05;
    this.scene.add(halo);
  }

  // Base lighting mode: 'idle' | 'chase' | 'buzzed' | 'hurry' | 'celebrate'
  neonMode(name) {
    const modes = { idle: 0, chase: 1, buzzed: 2, hurry: 3, celebrate: 4 };
    this.neonUniforms.uMode.value = modes[name] ?? 0;
    this.neonUniforms.uModeT.value = this.clock?.elapsedTime ?? 0;
  }

  // Transient flash on top of the mode:
  // 'solved' (green) | 'reveal' (white/green) | 'good' (white sweep) |
  // 'bad' (red blink) | 'bankrupt' (red sweep)
  neonFlash(name, durationSec) {
    const flashes = { solved: 1, reveal: 2, good: 3, bad: 4, bankrupt: 5 };
    const defaults = { solved: 2.4, reveal: 1.6, good: 1.5, bad: 0.8, bankrupt: 1.6 };
    this.neonUniforms.uFlash.value = flashes[name] ?? 0;
    this.neonUniforms.uFlashT.value = this.clock?.elapsedTime ?? 0;
    this.neonUniforms.uFlashDur.value = durationSec ?? defaults[name] ?? 1;
  }

  buildTiles() {
    const geo = new THREE.BoxGeometry(TILE_W, TILE_H, TILE_D);
    for (let row = 0; row < 4; row++) {
      const len = ROW_LENGTHS[row];
      for (let col = 0; col < len; col++) {
        const mats = [
          this.matSide,
          this.matSide,
          this.matSide,
          this.matSide,
          this.matEmpty,
          this.matSide,
        ];
        const mesh = new THREE.Mesh(geo, mats);
        mesh.position.set((col - (len - 1) / 2) * PITCH_X, this.rowY(row), 0);
        mesh.castShadow = true;
        this.scene.add(mesh);
        this.tiles.set(`${row},${col}`, {
          mesh,
          state: "empty",
          char: null,
          flipToken: 0,
        });
      }
    }
  }

  // Chase-light bulbs along the top and bottom edges plus the widest sides.
  buildBulbs() {
    this.bulbMats = [0, 1, 2].map(
      () => new THREE.MeshBasicMaterial({ color: 0xffe9a8 })
    );
    this.bulbPhase = 0;

    // Bulbs trace the gold pill's band (a stadium path), like the real
    // set surround — not the board frame.
    const geo = new THREE.SphereGeometry(0.1, 12, 12);
    const positions = [];
    const seg = GOLD_W * 0.27; // matches gold_sunburst.png capsule geometry
    const rb = GOLD_H * 0.45 * 0.92; // band-center radius
    const straight = 2 * seg;
    const cap = Math.PI * rb;
    const L = 2 * straight + 2 * cap;
    const n = 40;
    for (let i = 0; i < n; i++) {
      let s = (L * i) / n;
      if (s < straight) {
        positions.push([-seg + s, rb]);
      } else if ((s -= straight) < cap) {
        const a = Math.PI / 2 - s / rb;
        positions.push([seg + rb * Math.cos(a), rb * Math.sin(a)]);
      } else if ((s -= cap) < straight) {
        positions.push([seg - s, -rb]);
      } else {
        s -= straight;
        const a = -Math.PI / 2 - s / rb;
        positions.push([-seg + rb * Math.cos(a), rb * Math.sin(a)]);
      }
    }

    this.bulbs = [];
    positions.forEach(([x, y], i) => {
      const mesh = new THREE.Mesh(geo, this.bulbMats[i % 3]);
      mesh.position.set(x, y, -2.2);
      this.scene.add(mesh);
      this.bulbs.push(mesh);
    });

  }

  buildGlow() {
    const size = 256;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(
      size / 2, size / 2, size * 0.05,
      size / 2, size / 2, size * 0.5
    );
    grad.addColorStop(0, "rgba(255,255,255,0.9)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    this.glowMat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(28, 13), this.glowMat);
    plane.position.set(0, 0, -0.6);
    this.scene.add(plane);
  }

  buildLights() {
    // Keep lit whites just under 1.0 radiance so only true emissives
    // (blue tiles, bulbs, specular glints) cross the bloom threshold.
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.18));
    const key = new THREE.DirectionalLight(0xfff4e0, 0.95);
    key.position.set(-6, 8, 10);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -13;
    key.shadow.camera.right = 13;
    key.shadow.camera.top = 8;
    key.shadow.camera.bottom = -8;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 40;
    key.shadow.bias = -0.0006;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xbfd8ff, 0.45);
    fill.position.set(7, -3, 8);
    this.scene.add(fill);
    const kicker = new THREE.PointLight(0x8f7bff, 3.5, 40);
    kicker.position.set(0, -7, 6);
    this.scene.add(kicker);

    // No lit floor plane — the stage below fades to black (like the show's
    // hero shots) and the gold pill reflects into it instead.
  }

  resize() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    if (!W || !H) return;
    this.renderer.setSize(W, H, false);
    this.composer.setSize(W, H);

    // Board sub-rectangle (CSS px). Fallback: centered 70% of the screen.
    let r = this.region;
    if (!r || r.width < 60 || r.height < 60) {
      r = { x: W * 0.1, y: H * 0.16, width: W * 0.8, height: H * 0.6 };
    }

    // Fit the whole set piece (gold pill included) into the region, then
    // extend the view to the window.
    this.camera.aspect = r.width / r.height;
    // Extra vertical headroom: the low camera angle pushes the pill's
    // bottom down in screen space, so it needs more margin than the width.
    const boardW = Math.max(ROW_LENGTHS[1] * PITCH_X + 2.1, PILL_HALF_W * 2.06);
    const boardH = Math.max(4 * PITCH_Y + 1.9, PILL_HALF_H * 2.38);
    const vfov = (this.camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const distW = boardW / 2 / Math.tan(hfov / 2);
    const distH = boardH / 2 / Math.tan(vfov / 2);
    this.baseDist = Math.max(distW, distH) * 1.06;
    this.camera.position.z = this.baseDist;
    this.camera.setViewOffset(r.width, r.height, -r.x, -r.y, W, H);
    this.camera.updateProjectionMatrix();
  }

  // --- Camera director: TV-style moves layered over the idle drift ---

  // Cut to a new camera position, then run a FIXED-DURATION eased glide
  // home — fast confident start, soft landing, no slow creeping tail.
  // Cycles broadcast moves: side sweep, crane from above, pull-back.
  sweepIn() {
    const d = this.baseDist || 20;
    this.sweepIdx = ((this.sweepIdx ?? -1) + 1) % 3;
    this.sweepSide = -(this.sweepSide || 1);
    let from;
    let dur;
    if (this.sweepIdx === 0) {
      from = { x: 12 * this.sweepSide, y: -4.5, z: d * 1.5 };
      dur = 1500;
    } else if (this.sweepIdx === 1) {
      from = { x: 3 * this.sweepSide, y: 9, z: d * 1.3 };
      dur = 1600;
    } else {
      from = { x: 2 * this.sweepSide, y: -0.5, z: d * 0.55 };
      dur = 1300;
    }
    this.camera.position.set(from.x, from.y, from.z);
    this.camAnim = { t0: performance.now(), dur, from };
  }

  // Quick dolly kick with a springy return (letter reveals, buzz-ins).
  punchIn(strength = 0.04) {
    this.zoomV -= strength * 9;
  }

  // Brief celebratory sway (solves, wins) — one confident arc, then home.
  celebrateCamera(seconds = 2.1) {
    this.orbitT = seconds;
    this.punchIn(0.12);
  }

  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;

    // Zoom kick spring (underdamped — it overshoots and rings once).
    this.zoom = this.zoom ?? 0;
    this.zoomV = this.zoomV ?? 0;
    this.zoomV += (-140 * this.zoom - 11 * this.zoomV) * dt;
    this.zoom += this.zoomV * dt;

    // Celebration orbit fades out over its duration.
    let orbitX = 0;
    let orbitY = 0;
    let orbitZoom = 0;
    if (this.orbitT > 0) {
      this.orbitT -= dt;
      const w = Math.min(1, this.orbitT / 1.2); // ease out at the end
      orbitX = Math.sin(t * 1.4) * 4.4 * w;
      orbitY = Math.cos(t * 1.1) * 1.5 * w;
      orbitZoom = -0.07 * w; // lean in while circling
    }

    // Examine mode: player-driven orbit overrides everything else.
    if (this.examine) {
      const ex = this.examine;
      ex.yaw += (ex.tYaw - ex.yaw) * 0.1;
      ex.pitch += (ex.tPitch - ex.pitch) * 0.1;
      ex.dist += (ex.tDist - ex.dist) * 0.1;
      const d = (this.baseDist || 20) * ex.dist;
      this.camera.position.set(
        d * Math.sin(ex.yaw) * Math.cos(ex.pitch),
        0.1 + d * Math.sin(ex.pitch),
        d * Math.cos(ex.yaw) * Math.cos(ex.pitch)
      );
      this.camera.lookAt(0, 0.1, 0);
    } else {
    // Camera motion comes only from scripted moves + a slow idle drift —
    // no mouse input.
    const px = Math.sin(t * 0.4) * 0.4 + orbitX;
    const py = -1.7 + Math.cos(t * 0.31) * 0.2 + orbitY;
    const pz = (this.baseDist || 20) * (1 + this.zoom + orbitZoom);
    if (this.camAnim) {
      // Timed move: ease from the cut pose to the (drifting) home pose.
      const p = Math.min(1, (performance.now() - this.camAnim.t0) / this.camAnim.dur);
      const e = 1 - Math.pow(1 - p, 4); // easeOutQuart
      const f = this.camAnim.from;
      this.camera.position.set(
        f.x + (px - f.x) * e,
        f.y + (py - f.y) * e,
        f.z + (pz - f.z) * e
      );
      if (p >= 1) this.camAnim = null;
    } else {
      // Snappy follow of the drifting target (tracks springs and orbits).
      this.camera.position.x += (px - this.camera.position.x) * 0.12;
      this.camera.position.y += (py - this.camera.position.y) * 0.12;
      this.camera.position.z += (pz - this.camera.position.z) * 0.12;
    }
    this.camera.lookAt(0, 0.1, 0);
    }

    // Chase lights: three phase groups pulsing in sequence
    const speed = this.glowColor ? 9 : 2.2;
    this.bulbPhase += speed / 60;
    this.bulbMats.forEach((m, i) => {
      const s = 0.35 + 0.65 * Math.max(0, Math.sin(this.bulbPhase + (i * Math.PI * 2) / 3));
      m.color.setRGB(2.8 * s, 2.3 * s, 1.25 * s);
    });

    // Neon ring: advance time, auto-clear finished flashes.
    if (this.neonUniforms) {
      this.neonUniforms.uTime.value = t;
      const nu = this.neonUniforms;
      if (nu.uFlash.value > 0 && t - nu.uFlashT.value > nu.uFlashDur.value) {
        nu.uFlash.value = 0;
      }
    }

    if (this.glowColor) {
      this.glowPhase += 0.045;
      const pulse = 0.4 + 0.22 * Math.sin(this.glowPhase);
      this.glowMat.opacity += (pulse - this.glowMat.opacity) * 0.1;
    } else if (this.glowMat.opacity > 0.005) {
      this.glowMat.opacity *= 0.92;
    } else {
      this.glowMat.opacity = 0;
    }

    this.composer.render();
  }

  // --- Textures ---

  letterMaterial(char) {
    const key = "letter:" + char;
    if (this.letterTextures.has(key)) return this.letterTextures.get(key);
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 320;
    const g = c.getContext("2d");
    // Composite the glyph over the generated tile-face texture so letter
    // tiles share the same surface character as blank ones.
    if (this.tileFaceImg?.complete && this.tileFaceImg.naturalWidth > 0) {
      g.drawImage(this.tileFaceImg, 0, 0, c.width, c.height);
    } else {
      const grad = g.createLinearGradient(0, 0, 0, c.height);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(1, "#e8ebe4");
      g.fillStyle = grad;
      g.fillRect(0, 0, c.width, c.height);
    }
    // Big, heavy glyph: Roboto Black plus a same-color stroke to embolden.
    g.fillStyle = "#0a0d10";
    g.strokeStyle = "#0a0d10";
    g.lineJoin = "round";
    g.lineWidth = 11;
    g.font = "900 252px 'Roboto', sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.strokeText(char, c.width / 2, c.height * 0.55);
    g.fillText(char, c.width / 2, c.height * 0.55);
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 8;
    tex.colorSpace = THREE.SRGBColorSpace;
    // Unlit, like all tile faces — crisp print, no lighting wash.
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    this.letterTextures.set(key, mat);
    return mat;
  }

  // --- Tile state & animation ---

  setFront(tile, material) {
    tile.mesh.material[4] = material;
  }

  // Tile faces change instantly, like the show's monitor board — no flip,
  // no wobble. The flipToken guards stale delayed swaps across resets.

  reset() {
    for (const tile of this.tiles.values()) {
      tile.flipToken++;
      tile.state = "empty";
      tile.char = null;
      tile.mesh.rotation.y = 0;
      tile.mesh.scale.set(1, 1, 1);
      this.setFront(tile, this.matEmpty);
    }
    this.setGlow(null);
    this.neonMode?.("idle");
  }

  async setPuzzle(cells, stagger = 22) {
    this.cells = cells;
    this.sweepIn(); // TV-style camera sweep onto the fresh board
    const jobs = [];
    cells.forEach((cell, i) => {
      const tile = this.tiles.get(`${cell.row},${cell.col}`);
      if (!tile) return;
      tile.char = cell.char;
      tile.state = cell.guessable ? "blank" : "symbol";
      const mat = cell.guessable
        ? this.matBlank
        : this.letterMaterial(cell.char);
      const token = tile.flipToken;
      jobs.push(
        delay(i * stagger).then(() => {
          if (tile.flipToken === token) this.setFront(tile, mat);
        })
      );
    });
    await Promise.all(jobs);
  }

  tileAt(row, col) {
    return this.tiles.get(`${row},${col}`);
  }

  async revealCell(row, col, { blueMs = 450 } = {}) {
    const tile = this.tileAt(row, col);
    if (!tile || tile.state !== "blank") return;
    tile.state = "revealing";
    const token = tile.flipToken;
    this.setFront(tile, this.matBlue);
    await delay(blueMs);
    if (tile.flipToken !== token) return;
    this.setFront(tile, this.letterMaterial(tile.char));
    tile.state = "letter";
  }

  async revealCellQuick(row, col) {
    const tile = this.tileAt(row, col);
    if (!tile || tile.state !== "blank") return;
    tile.state = "letter";
    this.setFront(tile, this.letterMaterial(tile.char));
  }

  unrevealedCells() {
    return (this.cells || []).filter((c) => {
      const tile = this.tileAt(c.row, c.col);
      return tile && tile.state === "blank";
    });
  }

  setGlow(color) {
    this.glowColor = color;
    if (color) {
      const map = { gold: 0xffd24a, blue: 0x3a7bff, green: 0x2bd96a };
      this.glowMat.color = new THREE.Color(map[color] ?? 0xffffff);
      this.glowPhase = 0;
      if (color === "gold") this.celebrateCamera();
    }
  }
}
