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

const STARFIELD_FRAG = `
uniform float uTime;
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(17.0, 9.2);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = vUv;
  vec2 p = uv * vec2(2.4, 1.2);
  float t = uTime * 0.02;
  float horizon = 0.30;
  vec3 col;

  if (uv.y > horizon) {
    // --- Studio wall: navy panels, rails, spotlight pools ---
    float wy = (uv.y - horizon) / (1.0 - horizon);
    col = mix(vec3(0.030, 0.050, 0.115), vec3(0.010, 0.018, 0.055), wy);

    // Vertical panel seams
    float seam = abs(fract(uv.x * 12.0) - 0.5);
    col *= 1.0 - 0.12 * smoothstep(0.46, 0.5, seam);
    // Horizontal lighting rail
    col *= 1.0 - 0.15 * smoothstep(0.008, 0.0, abs(uv.y - 0.64));
    col += vec3(0.06, 0.10, 0.18) * smoothstep(0.004, 0.0, abs(uv.y - 0.645));

    // Colored spotlight pools on the wall
    vec2 d1 = uv - vec2(0.18, 0.82);
    vec2 d2 = uv - vec2(0.50, 0.95);
    vec2 d3 = uv - vec2(0.82, 0.82);
    col += vec3(0.10, 0.05, 0.17) * exp(-14.0 * dot(d1, d1));
    col += vec3(0.05, 0.08, 0.17) * exp(-12.0 * dot(d2, d2));
    col += vec3(0.11, 0.04, 0.14) * exp(-14.0 * dot(d3, d3));

    // Sweeping diagonal rig beams
    float b1 = pow(0.5 + 0.5 * sin((uv.x * 1.4 + uv.y * 0.9) * 14.0 - t * 6.0), 7.0);
    float b2 = pow(0.5 + 0.5 * sin((uv.x * -1.1 + uv.y * 0.7) * 11.0 + t * 4.0), 8.0);
    float edge = smoothstep(0.2, 0.7, abs(uv.x - 0.5) + abs(uv.y - 0.55));
    col += vec3(0.08, 0.03, 0.16) * b1 * edge;
    col += vec3(0.10, 0.02, 0.13) * b2 * edge;

    // Sparse rig lights
    vec2 sp = p * 110.0;
    vec2 cell = floor(sp);
    float star = hash(cell);
    if (star > 0.9925) {
      vec2 pos = fract(sp) - 0.5;
      float d = length(pos);
      float twinkle = 0.5 + 0.5 * sin(uTime * (1.0 + star * 4.0) + star * 40.0);
      col += vec3(0.9, 0.9, 1.0) * smoothstep(0.35, 0.0, d) * twinkle * 0.28;
    }
  } else {
    // --- Glossy stage floor: dark, with smeared reflections ---
    float fy = uv.y / horizon;
    col = mix(vec3(0.004, 0.006, 0.014), vec3(0.028, 0.048, 0.105), fy * fy);
    float streak = fbm(vec2(uv.x * 7.0, uv.y * 1.4 + t * 2.0));
    col += vec3(0.014, 0.030, 0.060) * streak * fy;
  }

  // Lit stage edge at the horizon (cyan strip like the show's set)
  col += vec3(0.10, 0.30, 0.40) * exp(-abs(uv.y - horizon) * 130.0);
  // Warm glow pooling behind the board
  vec2 dc = uv - vec2(0.5, 0.55);
  col += vec3(0.055, 0.045, 0.03) * exp(-9.0 * dot(dc, dc));

  float vig = smoothstep(1.35, 0.3, length(uv - vec2(0.5, 0.45)));
  col *= vig;

  gl_FragColor = vec4(col, 1.0);
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

  // Attach generated textures to materials only once they actually load,
  // so a missing file degrades to the flat-color look instead of black.
  loadTextures() {
    const loader = new THREE.TextureLoader();
    const attach = (file, slot, { repeat = null, onLoad = null } = {}, targets) => {
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
        },
        undefined,
        () => {}
      );
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
    this.starUniforms = { uTime: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.starUniforms,
      vertexShader:
        "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: STARFIELD_FRAG,
      depthWrite: false,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(240, 120), mat);
    plane.position.set(0, 0, -40);
    this.scene.add(plane);

    // Painted soft-focus studio backdrop (generated: tools/gen_backdrop.py).
    new THREE.TextureLoader().load(
      "assets/textures/studio_backdrop.png",
      (map) => {
        map.colorSpace = THREE.SRGBColorSpace;
        const bg = new THREE.Mesh(
          new THREE.PlaneGeometry(96, 48),
          new THREE.MeshBasicMaterial({ map, depthWrite: false })
        );
        // Stage line in the image sits at 68% height; align it just
        // below the pill's bottom.
        bg.position.set(0, 48 * 0.18 - PILL_HALF_H - 1.2, -12);
        this.scene.add(bg);
      },
      undefined,
      () => {}
    );

    // Gold sunburst set piece behind the board, like the show's surround.
    new THREE.TextureLoader().load(
      "assets/textures/gold_sunburst.png",
      (map) => {
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
      () => {}
    );
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
      new THREE.ExtrudeGeometry(this.steppedShape(0.55), {
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
      new THREE.ExtrudeGeometry(this.steppedShape(1.0), {
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

    // Neon outline: a steady blue strip (like the first version) with
    // bright light dashes RUNNING around the silhouette on top of it.
    const pts = this.steppedOutlinePoints(0.3, 0);
    const path = new THREE.CurvePath();
    for (let i = 0; i < pts.length; i++) {
      path.add(new THREE.LineCurve3(pts[i], pts[(i + 1) % pts.length]));
    }

    // Steady base strip
    this.matNeon = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.matNeon.color.setRGB(0.14, 1.15, 1.4);
    const strip = new THREE.Mesh(
      new THREE.TubeGeometry(path, 256, 0.03, 8, true),
      this.matNeon
    );
    strip.position.z = -0.05;
    this.scene.add(strip);

    // Traveling dashes: alpha-mapped tube, texture offset animated in tick.
    // TubeGeometry runs uv.x along the tube's length, so scrolling offset.x
    // sends the dashes racing around the board.
    const dashCanvas = document.createElement("canvas");
    dashCanvas.width = 256;
    dashCanvas.height = 4;
    const dg = dashCanvas.getContext("2d");
    const grad = dg.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0.0, "black");
    grad.addColorStop(0.62, "black");
    grad.addColorStop(0.8, "white"); // comet: sharp head, long tail
    grad.addColorStop(0.86, "white");
    grad.addColorStop(0.9, "black");
    grad.addColorStop(1.0, "black");
    dg.fillStyle = grad;
    dg.fillRect(0, 0, 256, 4);
    this.dashTex = new THREE.CanvasTexture(dashCanvas);
    this.dashTex.wrapS = THREE.RepeatWrapping;
    this.dashTex.repeat.set(6, 1); // six comets chasing each other
    this.matDash = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      alphaMap: this.dashTex,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.matDash.color.setRGB(0.5, 3.0, 3.6);
    const dash = new THREE.Mesh(
      new THREE.TubeGeometry(path, 256, 0.052, 8, true),
      this.matDash
    );
    dash.position.z = -0.04;
    this.scene.add(dash);
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
    const boardH = Math.max(4 * PITCH_Y + 1.9, PILL_HALF_H * 2.55);
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

  // Hard cut to a new camera position, then glide home (used on new
  // puzzles). Cycles through broadcast-style moves: side sweep, crane
  // down from above, and a close-up pull-back reveal.
  sweepIn() {
    const d = this.baseDist || 20;
    this.sweepIdx = ((this.sweepIdx ?? -1) + 1) % 3;
    this.sweepSide = -(this.sweepSide || 1);
    if (this.sweepIdx === 0) {
      // Side sweep (alternating left/right)
      this.camera.position.x += 12 * this.sweepSide;
      this.camera.position.y -= 3.5;
      this.camera.position.z = d * 1.55;
    } else if (this.sweepIdx === 1) {
      // Crane shot: drop in from above
      this.camera.position.x += 3 * this.sweepSide;
      this.camera.position.y += 10;
      this.camera.position.z = d * 1.3;
    } else {
      // Close-up on the board, pulling back to full frame
      this.camera.position.x += 2 * this.sweepSide;
      this.camera.position.y += 1;
      this.camera.position.z = d * 0.52;
    }
    this.punchIn(0.03);
  }

  // Quick dolly kick with a springy return (letter reveals, buzz-ins).
  punchIn(strength = 0.04) {
    this.zoomV -= strength * 9;
  }

  // Slow celebratory orbit (solves, wins) — wide, with a dolly-in kick.
  celebrateCamera(seconds = 5) {
    this.orbitT = seconds;
    this.punchIn(0.12);
  }

  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    this.starUniforms.uTime.value = t;

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

    // Camera motion comes only from scripted moves + a slow idle drift —
    // no mouse input.
    const px = Math.sin(t * 0.4) * 0.4 + orbitX;
    const py = -1.7 + Math.cos(t * 0.31) * 0.2 + orbitY;
    const pz = (this.baseDist || 20) * (1 + this.zoom + orbitZoom);
    this.camera.position.x += (px - this.camera.position.x) * 0.04;
    this.camera.position.y += (py - this.camera.position.y) * 0.04;
    this.camera.position.z += (pz - this.camera.position.z) * 0.07;
    this.camera.lookAt(0, 0.1, 0);

    // Chase lights: three phase groups pulsing in sequence
    const speed = this.glowColor ? 9 : 2.2;
    this.bulbPhase += speed / 60;
    this.bulbMats.forEach((m, i) => {
      const s = 0.35 + 0.65 * Math.max(0, Math.sin(this.bulbPhase + (i * Math.PI * 2) / 3));
      m.color.setRGB(2.8 * s, 2.3 * s, 1.25 * s);
    });

    // Steady neon strip + light dashes racing around the board.
    // Celebrations: dashes sprint and brighten (no strobing).
    if (this.dashTex) {
      const dashSpeed = this.glowColor ? 0.55 : 0.12;
      this.dashTex.offset.x -= dashSpeed * dt;
      const k = this.glowColor ? 1.4 : 1.0;
      this.matDash.color.setRGB(0.5 * k, 3.0 * k, 3.6 * k);
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
    g.fillStyle = "#0a0d10";
    g.font = "900 214px 'Roboto', sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
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
