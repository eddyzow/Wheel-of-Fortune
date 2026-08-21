# Wheel of Fortune

A fan-made web version of Wheel of Fortune, the popular TV game show — built as a training tool for the real thing.

**Play it:** open `docs/index.html` via any static server, e.g.

```bash
python3 -m http.server 8000 --directory docs
```

## Features

- **Realistic 3D puzzle board** — Three.js scene with an UnrealBloom pass, physical (clearcoat) materials, generated PBR textures, chase-light bulbs, studio lighting, and the show's blue-flash + spring-flip letter reveals
- **Physics-based wheel** — procedurally drawn 24-wedge wheel with real angular momentum, friction, a spring-loaded pointer that rings off every peg, and a spun-metal hub
- **Animated shader backdrop** — a nebula/starfield rendered inside the 3D stage so it participates in the bloom pass
- **Generated assets** — procedural texture pack (`tools/gen_textures.py`) and AI-generated UI/reveal sound effects
- **Five game modes**
  - **Full Game** — toss-up, two classic rounds, then the bonus round with a prize envelope
  - **Classic** — endless rounds: spin, guess consonants, buy vowels, solve
  - **Toss-Up** — endless toss-ups with decaying points and a running average
  - **Triple Toss-Up** — $1,000 / $2,000 / $3,000, one guess each
  - **Bonus Round** — R S T L N E plus three consonants and a vowel, 10 seconds to solve
- **2,200+ puzzles** across authentic show categories, validated to fit the 12/14/14/12 board
- Letter tracker, round banners, snappy reveal pacing, confetti celebrations

## Tech

Vanilla ES modules (`docs/js/`), Three.js for the board, canvas 2D for the wheel, raw WebGL for the background shader, Howler for audio. No build step — deploys straight from `docs/` (GitHub Pages).

## Disclaimer

This project is fully open source. All rights reserved to Wheel of Fortune, Califon Productions, and Sony Pictures Television, owners of the Wheel of Fortune and all related trademarks. This is NOT a licensed game and purely a fan remake!
