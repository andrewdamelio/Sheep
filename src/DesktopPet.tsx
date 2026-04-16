// DesktopPet — eSheep64 with full special events
// Sprite: Adrianotiger/desktopPet (esheep64), bundled locally
// Special events inspired by lwu309/Scmpoo + eSheep64 XML animations

import { useEffect, useRef, useState, useCallback } from 'react';
import { sfx } from './sound-fx';
import sheepSprite from './assets/esheep64.png';
import scmpoo110 from './assets/scmpoo110.png';
import scmpoo111 from './assets/scmpoo111.png';
import scmpoo103 from './assets/scmpoo103.png';
import scmpoo108 from './assets/scmpoo108.png';

const TILE_W = 60;
const TILE_H = 64;
const TILES_X = 16;
const SCALE = 32 / TILE_W;
const RENDER_W = Math.round(TILE_W * SCALE);
const RENDER_H = Math.round(TILE_H * SCALE);

// Scmpoo sprite sheets: 640×40, 16 frames × 40px each
const S_FW = 40;
const S_FH = 40;
// Scale poo companion to match the sheep's rendered width exactly
const POO_SCALE = RENDER_W / S_FW; // 32/40 = 0.8
function scmpooStyle(sheet: string, frameIdx: number, x: number, y: number, scale = 2): React.CSSProperties {
  return {
    position: 'fixed',
    left: x, top: y,
    width: S_FW * scale, height: S_FH * scale,
    overflow: 'hidden',
    backgroundImage: `url(${sheet})`,
    backgroundPosition: `${-(frameIdx * S_FW * scale)}px 0px`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${16 * S_FW * scale}px ${S_FH * scale}px`,
    imageRendering: 'pixelated',
    userSelect: 'none',
    pointerEvents: 'none',
  };
}

function framePos(idx: number) {
  const col = idx % TILES_X;
  const row = Math.floor(idx / TILES_X);
  return { x: -(col * TILE_W), y: -(row * TILE_H) };
}

function sheepStyle(frame: number, dir: 1 | -1, x: number, y: number, extra: React.CSSProperties = {}): React.CSSProperties {
  const fp = framePos(frame);
  return {
    position: 'fixed',
    left: x, top: y,
    width: RENDER_W, height: RENDER_H,
    overflow: 'hidden',
    backgroundImage: `url(${sheepSprite})`,
    backgroundPosition: `${fp.x * SCALE}px ${fp.y * SCALE}px`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${TILES_X * TILE_W * SCALE}px ${11 * TILE_H * SCALE}px`,
    imageRendering: 'pixelated',
    transform: dir === 1 ? 'scaleX(-1)' : 'none',
    userSelect: 'none',
    ...extra,
  };
}


// ── State machine ────────────────────────────────────────────────────────────
type SheepState =
  | 'idle' | 'walk' | 'run' | 'run_begin' | 'run_end'
  | 'sleep1a' | 'sleep1b' | 'sleep2a' | 'sleep2b'
  | 'fall' | 'drag' | 'graze' | 'seek'
  | 'bathtub'                        // relaxing in the tub (frames 160-162)
  | 'pee'                            // the "poo" in Screen Mate Poo: pissa + pissb
  | 'blink' | 'yawn_quirk' | 'baa' | 'sneeze' | 'amazed' | 'blush'   // idle quirks
  | 'spin' | 'roll_move' | 'look_down' | 'turn_around'               // movement quirks
  | 'jump_down'                      // deliberate leap off a surface (or mid-screen)
  | 'land_soft' | 'land_hard'        // fall-intensity landing reactions
  | 'sit'                            // sitting cute (frames 32-35)
  | 'burn'                           // on fire! flies diagonally
  | 'boing'                          // bounce in place
  | 'climb_prep'                     // walk toward nearest screen edge
  | 'climb_up'                       // scale up the edge
  | 'top_walk'                       // walk across the top upside-down
  | 'climb_down'                     // descend the other side
  | 'blacksheep'                     // encounter animation when second sheep arrives
  | 'ufo_caught'                     // being beamed up by UFO
  | 'poo_sleep'                      // scmpoo103 frames 0-1: sleeping zzz
  | 'poo_sit'                        // scmpoo103 frames 2-4: sitting and staring
  | 'poo_yawn'                       // scmpoo103 frames 5-7: big yawn
  | 'poo_roll';                      // scmpoo108 frames 7-10: rolling around

interface AnimDef {
  frames: { idx: number; ms: number }[];
  loop?: boolean;
  next?: () => SheepState;
  vx?: number;
}

const ANIMS: Record<SheepState, AnimDef> = {
  idle: {
    frames: [{ idx: 3, ms: 300 }, { idx: 3, ms: 300 }],
    loop: false,
    next: () => {
      const r = Math.random();
      if (r < 0.16) return 'walk';
      if (r < 0.26) return 'run_begin';
      if (r < 0.34) return 'graze';
      if (r < 0.42) return 'sleep1a';
      if (r < 0.48) return 'sleep2a';
      if (r < 0.54) return 'sit';
      if (r < 0.61) return 'poo_sit';
      if (r < 0.68) return 'poo_yawn';
      if (r < 0.75) return 'poo_sleep';
      if (r < 0.81) return 'poo_roll';
      if (r < 0.84) return 'pee';
      // Idle quirks — small chances, blink the most common:
      if (r < 0.88) return 'blink';
      if (r < 0.90) return 'baa';
      if (r < 0.92) return 'yawn_quirk';
      if (r < 0.935) return 'sneeze';
      if (r < 0.945) return 'amazed';
      if (r < 0.955) return 'blush';
      // Movement quirks — rarer still:
      if (r < 0.965) return 'look_down';
      if (r < 0.975) return 'turn_around';
      if (r < 0.985) return 'spin';
      if (r < 0.993) return 'roll_move';
      if (r < 0.998) return 'jump_down';
      return 'idle';
    },
  },
  walk: {
    frames: [{ idx: 2, ms: 180 }, { idx: 3, ms: 180 }],
    loop: true, vx: 0.5,
    next: () => { const r = Math.random(); if (r < 0.15) return 'idle'; if (r < 0.25) return 'run_begin'; return 'walk'; },
  },
  run_begin: {
    frames: [{ idx: 2, ms: 110 }, { idx: 3, ms: 110 }, { idx: 2, ms: 110 }, { idx: 5, ms: 110 }, { idx: 4, ms: 110 }, { idx: 5, ms: 110 }],
    loop: false, vx: 1.0, next: () => 'run',
  },
  run: {
    frames: [{ idx: 5, ms: 100 }, { idx: 4, ms: 100 }, { idx: 4, ms: 100 }],
    loop: true, vx: 1.5,
    next: () => Math.random() < 0.2 ? 'run_end' : 'run',
  },
  run_end: {
    frames: [{ idx: 5, ms: 110 }, { idx: 4, ms: 110 }, { idx: 5, ms: 110 }, { idx: 4, ms: 110 }, { idx: 5, ms: 110 }, { idx: 3, ms: 110 }, { idx: 2, ms: 110 }, { idx: 3, ms: 110 }],
    loop: false, vx: 0.6, next: () => Math.random() < 0.5 ? 'idle' : 'walk',
  },
  sleep1a: {
    frames: [{ idx: 3, ms: 200 }, { idx: 107, ms: 200 }, { idx: 108, ms: 200 }, { idx: 107, ms: 200 }, { idx: 108, ms: 200 }, { idx: 107, ms: 200 }, { idx: 31, ms: 200 }, { idx: 32, ms: 200 }, { idx: 33, ms: 200 }, { idx: 0, ms: 500 }, { idx: 1, ms: 500 }],
    loop: false, next: () => 'sleep1b',
  },
  sleep1b: {
    frames: [{ idx: 0, ms: 700 }, { idx: 80, ms: 300 }, { idx: 79, ms: 300 }, { idx: 78, ms: 300 }, { idx: 77, ms: 300 }, { idx: 37, ms: 200 }, { idx: 38, ms: 200 }, { idx: 39, ms: 200 }, { idx: 38, ms: 200 }, { idx: 37, ms: 200 }, { idx: 6, ms: 200 }],
    loop: false, next: () => 'idle',
  },
  sleep2a: {
    frames: [{ idx: 3, ms: 200 }, { idx: 6, ms: 200 }, { idx: 7, ms: 200 }, { idx: 8, ms: 400 }, { idx: 8, ms: 400 }, { idx: 7, ms: 200 }, { idx: 8, ms: 400 }, { idx: 8, ms: 400 }],
    loop: false, next: () => 'sleep2b',
  },
  sleep2b: {
    frames: [{ idx: 8, ms: 400 }, { idx: 7, ms: 200 }, { idx: 6, ms: 200 }],
    loop: false, next: () => 'idle',
  },
  fall: {
    frames: [{ idx: 133, ms: 80 }],
    loop: true, vx: 0, next: () => 'idle',
  },
  drag: {
    frames: [{ idx: 42, ms: 100 }, { idx: 43, ms: 100 }, { idx: 43, ms: 100 }, { idx: 42, ms: 100 }, { idx: 44, ms: 100 }, { idx: 44, ms: 100 }],
    loop: true, next: () => 'fall',
  },
  graze: {
    // Eating animation — frames 58=reach down, 60-61=chew (matches Scmpoo eat sequence)
    frames: [
      { idx: 3, ms: 200 },
      { idx: 58, ms: 180 }, { idx: 60, ms: 130 }, { idx: 61, ms: 130 },
      { idx: 60, ms: 130 }, { idx: 61, ms: 130 }, { idx: 60, ms: 130 }, { idx: 61, ms: 130 },
      { idx: 58, ms: 180 }, { idx: 60, ms: 130 }, { idx: 61, ms: 130 },
      { idx: 60, ms: 130 }, { idx: 61, ms: 130 }, { idx: 60, ms: 130 }, { idx: 61, ms: 130 },
      { idx: 3, ms: 200 },
    ],
    loop: false, vx: 0, next: () => 'idle',
  },
  seek: {
    frames: [{ idx: 2, ms: 180 }, { idx: 3, ms: 180 }],
    loop: true, vx: 0.6, next: () => 'idle',
  },
  sit: {
    // Cute sitting pose (row 2, frames 32-35)
    frames: [
      { idx: 32, ms: 400 }, { idx: 33, ms: 400 }, { idx: 34, ms: 400 },
      { idx: 33, ms: 400 }, { idx: 32, ms: 500 },
    ],
    loop: false, vx: 0, next: () => 'idle',
  },
  bathtub: {
    // Relaxing soak — sheep rests while scmpoo110 tub prop is displayed separately
    frames: [
      { idx: 3, ms: 300 }, { idx: 6, ms: 300 }, { idx: 7, ms: 400 },
      { idx: 8, ms: 500 }, { idx: 8, ms: 500 }, { idx: 8, ms: 500 },
      { idx: 7, ms: 400 }, { idx: 6, ms: 300 }, { idx: 3, ms: 400 },
    ],
    loop: false, vx: 0, next: () => 'idle',
  },
  pee: {
    // The "poo" in Screen Mate Poo: pissa + pissb merged. Puddle prop grows under the sheep.
    // pissa: squat down → hold posture. pissb: straighten up → walk off.
    frames: [
      { idx: 3, ms: 200 }, { idx: 12, ms: 200 }, { idx: 13, ms: 200 },
      { idx: 103, ms: 200 }, { idx: 104, ms: 200 },
      { idx: 105, ms: 220 }, { idx: 106, ms: 220 },
      { idx: 105, ms: 220 }, { idx: 106, ms: 220 },
      { idx: 105, ms: 220 }, { idx: 106, ms: 220 },
      { idx: 104, ms: 200 }, { idx: 103, ms: 200 },
      { idx: 13, ms: 180 }, { idx: 12, ms: 180 },
    ],
    loop: false, vx: 0, next: () => 'idle',
  },
  // ── Idle quirks ──────────────────────────────────────────────────────────
  blink: {
    // Quick eye-close. Subtle, no speech bubble.
    frames: [{ idx: 3, ms: 80 }, { idx: 6, ms: 120 }, { idx: 3, ms: 80 }],
    loop: false, vx: 0, next: () => 'idle',
  },
  yawn_quirk: {
    // Sheep yawns — uses sleep-pose frames with a speech bubble fired separately.
    frames: [
      { idx: 3, ms: 150 }, { idx: 6, ms: 140 }, { idx: 7, ms: 200 },
      { idx: 8, ms: 450 }, { idx: 7, ms: 180 }, { idx: 6, ms: 140 }, { idx: 3, ms: 180 },
    ],
    loop: false, vx: 0, next: () => 'idle',
  },
  baa: {
    // Stand tall and call out. The speech bubble carries the joke.
    frames: [{ idx: 3, ms: 220 }, { idx: 6, ms: 140 }, { idx: 3, ms: 520 }],
    loop: false, vx: 0, next: () => 'idle',
  },
  sneeze: {
    // Brace, compress, bounce back — wind-up then recoil.
    frames: [
      { idx: 3, ms: 160 }, { idx: 6, ms: 140 },
      { idx: 62, ms: 80 }, { idx: 63, ms: 80 }, { idx: 64, ms: 80 }, { idx: 65, ms: 80 },
      { idx: 3, ms: 300 },
    ],
    loop: false, vx: 0, next: () => 'idle',
  },
  amazed: {
    // Holds a wide-eyed pose while a "⁉" bubble shows. Tiny wobble via the sit frame set.
    frames: [
      { idx: 3, ms: 180 }, { idx: 32, ms: 420 }, { idx: 33, ms: 160 },
      { idx: 32, ms: 360 }, { idx: 3, ms: 260 },
    ],
    loop: false, vx: 0, next: () => 'idle',
  },
  blush: {
    // Pink tint applied via render filter; sheep stands with a subtle sway.
    frames: [
      { idx: 3, ms: 280 }, { idx: 6, ms: 140 }, { idx: 3, ms: 320 },
      { idx: 6, ms: 140 }, { idx: 3, ms: 340 },
    ],
    loop: false, vx: 0, next: () => 'idle',
  },
  // ── Movement quirks ──────────────────────────────────────────────────────
  spin: {
    // Stationary pirouette — CSS rotation driven by rotStartTsRef over 800ms.
    frames: [
      { idx: 3, ms: 100 }, { idx: 3, ms: 100 }, { idx: 3, ms: 100 }, { idx: 3, ms: 100 },
      { idx: 3, ms: 100 }, { idx: 3, ms: 100 }, { idx: 3, ms: 100 }, { idx: 3, ms: 100 },
    ],
    loop: false, vx: 0, next: () => 'idle',
  },
  roll_move: {
    // Rolls along the ground in the facing direction. 2 full rotations in ~1.4s.
    frames: [
      { idx: 3, ms: 100 }, { idx: 3, ms: 100 }, { idx: 3, ms: 100 }, { idx: 3, ms: 100 },
      { idx: 3, ms: 100 }, { idx: 3, ms: 100 }, { idx: 3, ms: 100 }, { idx: 3, ms: 100 },
      { idx: 3, ms: 100 }, { idx: 3, ms: 100 }, { idx: 3, ms: 100 }, { idx: 3, ms: 100 },
      { idx: 3, ms: 100 }, { idx: 3, ms: 100 },
    ],
    loop: false, vx: 1.2, next: () => 'idle',
  },
  look_down: {
    // Sheep reaches down to inspect something on the ground. Pose held ~1.4s.
    frames: [
      { idx: 3, ms: 180 }, { idx: 58, ms: 320 }, { idx: 58, ms: 400 },
      { idx: 58, ms: 320 }, { idx: 3, ms: 220 },
    ],
    loop: false, vx: 0, next: () => 'idle',
  },
  turn_around: {
    // Pivot through the front-facing sit pose (frames 32/33) then face the opposite way.
    // Direction flip is triggered when this state completes (see frame-animation dispatch).
    frames: [
      { idx: 3, ms: 140 }, { idx: 32, ms: 160 }, { idx: 33, ms: 180 },
      { idx: 32, ms: 160 }, { idx: 3, ms: 160 },
    ],
    loop: false, vx: 0, next: () => 'idle',
  },
  jump_down: {
    // Windup (frames 0-3) holds position; launch velocity kicks in at frame 4.
    // Floor-collision intercepts the airborne frame and routes to land_soft/land_hard.
    frames: [
      { idx: 62, ms: 80 }, { idx: 63, ms: 80 }, { idx: 64, ms: 90 },
      { idx: 46, ms: 70 }, { idx: 133, ms: 2500 },
    ],
    loop: false, vx: 0, next: () => 'idle',
  },
  land_soft: {
    // Quick compression recovery — used for moderate drops.
    frames: [{ idx: 65, ms: 110 }, { idx: 66, ms: 110 }, { idx: 3, ms: 220 }],
    loop: false, vx: 0, next: () => 'idle',
  },
  land_hard: {
    // Splat + stun + recover. Dust-puff prop is spawned alongside.
    frames: [
      { idx: 70, ms: 120 }, { idx: 70, ms: 220 }, { idx: 70, ms: 180 },
      { idx: 66, ms: 160 }, { idx: 64, ms: 140 }, { idx: 6, ms: 180 }, { idx: 3, ms: 240 },
    ],
    loop: false, vx: 0, next: () => 'idle',
  },
  // ── Special events ─────────────────────────────────────────────────────────
  burn: {
    // On fire! Flies diagonally from top corner across screen — loops until floor landing
    frames: [
      { idx: 139, ms: 150 }, { idx: 140, ms: 150 }, { idx: 141, ms: 150 }, { idx: 142, ms: 150 },
      { idx: 143, ms: 150 }, { idx: 144, ms: 150 }, { idx: 145, ms: 150 },
      { idx: 144, ms: 150 }, { idx: 145, ms: 150 }, { idx: 144, ms: 150 }, { idx: 145, ms: 150 },
    ],
    loop: true, vx: 0, next: () => 'idle',
  },
  boing: {
    // Bounce in place (frames 62-70, then settle with frame 6)
    frames: [
      { idx: 62, ms: 90 }, { idx: 63, ms: 90 }, { idx: 64, ms: 90 }, { idx: 65, ms: 90 },
      { idx: 66, ms: 90 }, { idx: 67, ms: 90 }, { idx: 68, ms: 90 }, { idx: 69, ms: 90 },
      { idx: 70, ms: 90 }, { idx: 6, ms: 200 }, { idx: 3, ms: 200 },
    ],
    loop: false, vx: 0, next: () => 'idle',
  },
  climb_prep: {
    // Walk toward edge — movement handled in tick
    frames: [{ idx: 2, ms: 180 }, { idx: 3, ms: 180 }],
    loop: true, vx: 0.5, next: () => 'climb_up',
  },
  climb_up: {
    // Scale up the screen edge (frames from eSheep64 vertical_walk_up)
    frames: [{ idx: 31, ms: 120 }, { idx: 30, ms: 120 }, { idx: 15, ms: 120 }, { idx: 16, ms: 120 }],
    loop: true, vx: 0, next: () => 'top_walk',
  },
  top_walk: {
    // Walk upside-down across the top (frames from esheep64 top_walk2)
    frames: [{ idx: 98, ms: 130 }, { idx: 97, ms: 130 }],
    loop: true, vx: 0, next: () => 'climb_down',
  },
  climb_down: {
    // Descend the other side
    frames: [{ idx: 19, ms: 120 }, { idx: 20, ms: 120 }],
    loop: true, vx: 0, next: () => 'idle',
  },
  blacksheep: {
    // Encounter reaction when a second sheep runs past
    frames: [
      { idx: 3, ms: 200 }, { idx: 3, ms: 200 },
      { idx: 127, ms: 250 }, { idx: 128, ms: 250 }, { idx: 129, ms: 250 }, { idx: 130, ms: 300 },
      { idx: 130, ms: 300 }, { idx: 129, ms: 250 }, { idx: 128, ms: 250 }, { idx: 127, ms: 250 },
      { idx: 3, ms: 200 }, { idx: 3, ms: 200 },
    ],
    loop: false, vx: 0, next: () => 'idle',
  },
  ufo_caught: {
    // Being beamed up — y velocity handled in tick
    frames: [{ idx: 133, ms: 80 }, { idx: 46, ms: 80 }],
    loop: true, vx: 0, next: () => 'fall',
  },
  // ── Scmpoo companion animations ────────────────────────────────────────────
  poo_sleep: {
    // scmpoo103 frames 0-1: sleeping. Duration ~3s
    frames: [
      { idx: 3, ms: 500 }, { idx: 3, ms: 500 }, { idx: 3, ms: 500 },
      { idx: 3, ms: 500 }, { idx: 3, ms: 500 }, { idx: 3, ms: 500 },
    ],
    loop: false, vx: 0, next: () => 'idle',
  },
  poo_sit: {
    // scmpoo103 frames 2-4: sitting and staring. Duration ~2.8s
    frames: [
      { idx: 3, ms: 400 }, { idx: 3, ms: 400 }, { idx: 3, ms: 400 },
      { idx: 3, ms: 400 }, { idx: 3, ms: 400 }, { idx: 3, ms: 400 }, { idx: 3, ms: 400 },
    ],
    loop: false, vx: 0, next: () => 'idle',
  },
  poo_yawn: {
    // scmpoo103 frames 5-7: yawning. Duration ~2s
    frames: [
      { idx: 3, ms: 300 }, { idx: 3, ms: 300 }, { idx: 3, ms: 300 },
      { idx: 3, ms: 400 }, { idx: 3, ms: 300 }, { idx: 3, ms: 350 },
    ],
    loop: false, vx: 0, next: () => 'idle',
  },
  poo_roll: {
    // scmpoo108 frames 7-10: rolling. Duration ~1.4s
    frames: [
      { idx: 3, ms: 200 }, { idx: 3, ms: 200 }, { idx: 3, ms: 200 },
      { idx: 3, ms: 200 }, { idx: 3, ms: 200 }, { idx: 3, ms: 200 }, { idx: 3, ms: 200 },
    ],
    loop: false, vx: 0, next: () => 'walk',
  },
};

const LOOP_CYCLES: Partial<Record<SheepState, [number, number]>> = {
  idle:       [60, 200],
  walk:       [30, 100],
  run:        [15, 50],
  fall:       [1, 3],
  seek:       [20, 60],
  climb_prep: [10, 30],
  climb_up:   [999, 999], // controlled by tick
  top_walk:   [999, 999],
  climb_down: [999, 999],
  burn:       [999, 999], // loops until floor landing
};

interface SecondSheep {
  x: number; y: number; dir: 1 | -1;
  phase: 'approach' | 'encounter' | 'leave';
  frame: number; nextFrameTime: number;
}

type UfoPhase = 'descend' | 'beam' | 'alien_arrive' | 'alien_wave' | 'alien_leave' | 'depart';
interface UfoDisplay {
  x: number; y: number; beamH: number; phase: UfoPhase;
  ufoFrame: number; // 0-5 = saucer, 9-12 = abduction frames
}
interface AlienDisplay { x: number; y: number; frame: number; }

interface WinRect { x: number; y: number; w: number; h: number }
interface DesktopPetProps { visible: boolean; speedMultiplier?: number; windowRect?: WinRect | null; }

export default function DesktopPet({ visible, speedMultiplier = 1, windowRect = null }: DesktopPetProps) {
  // ── Main sheep physics refs ─────────────────────────────────────────────
  const posRef = useRef({ x: 200, y: -RENDER_H });
  const velRef = useRef({ x: 0, y: 0 });
  const stateRef = useRef<SheepState>('fall');
  const dirRef = useRef<1 | -1>(1);
  const frameIdxRef = useRef(0);
  const loopCycleRef = useRef(0);
  const maxCyclesRef = useRef(80);
  const dragRef = useRef(false);
  const dragOffRef = useRef({ x: 0, y: 0 });
  const velHistRef = useRef<{ x: number; y: number }[]>([]);
  const speedMulRef = useRef(1);
  useEffect(() => { speedMulRef.current = speedMultiplier; }, [speedMultiplier]);
  const windowRectRef = useRef<WinRect | null>(null);
  useEffect(() => { windowRectRef.current = windowRect; }, [windowRect]);
  const onWindowRef = useRef(false); // sheep currently standing on a window titlebar

  // ── Flower refs ─────────────────────────────────────────────────────────
  const flowerRef = useRef<{ x: number; y: number; frame: number } | null>(null);
  const eatingFlowerRef = useRef(false);

  // ── Climb refs ──────────────────────────────────────────────────────────
  const climbEdgeRef = useRef<'left' | 'right'>('left');
  const climbTopTargetXRef = useRef(0); // where to walk to across top

  // ── Second sheep (blacksheep event) refs ───────────────────────────────
  const secondSheepRef = useRef<SecondSheep | null>(null);

  // ── UFO refs ────────────────────────────────────────────────────────────
  const ufoRef = useRef<{
    x: number; y: number; targetX: number; phase: UfoPhase;
    isEncounter: boolean; alienY: number; alienWaveStart: number;
  } | null>(null);

  // ── Display states ──────────────────────────────────────────────────────
  const [displayFrame, setDisplayFrame] = useState(0);
  const [displayPos, setDisplayPos] = useState({ x: 200, y: -RENDER_H });
  const [displayDir, setDisplayDir] = useState<1 | -1>(1);
  const [flower, setFlower] = useState<{ x: number; y: number; frame: number } | null>(null);
  const [flowerEating, setFlowerEating] = useState(false);
  const [bathtubProp, setBathtubProp] = useState<{ x: number; y: number; frame: number; splash?: boolean } | null>(null);
  const bathtubPropRef = useRef<{ x: number; y: number; frame: number; startTs: number; splash?: boolean } | null>(null);
  const [puddle, setPuddle] = useState<{ x: number; y: number; w: number; h: number; alpha: number } | null>(null);
  const puddleRef = useRef<{ x: number; y: number; startTs: number } | null>(null);
  const [secondSheepDisplay, setSecondSheepDisplay] = useState<SecondSheep | null>(null);
  const [alienDisplay, setAlienDisplay] = useState<AlienDisplay | null>(null);
  const [ufoDisplay, setUfoDisplay] = useState<UfoDisplay | null>(null);
  const [flipY, setFlipY] = useState(false); // used during top_walk
  const rotStartTsRef = useRef(0);
  const [displayRot, setDisplayRot] = useState(0); // spin/roll rotation in degrees
  const fallStartYRef = useRef(0);
  const jumpLaunchedRef = useRef(false);
  const dustPuffRef = useRef<{ x: number; y: number; startTs: number } | null>(null);
  const [dustPuff, setDustPuff] = useState<{ x: number; y: number; scale: number; alpha: number } | null>(null);

  // ── Scmpoo companion animations ─────────────────────────────────────────
  const pooRef = useRef<{ sheet: string; frames: number[]; frameDuration: number; startTs: number } | null>(null);
  const [pooDisplay, setPooDisplay] = useState<{ sheet: string; frame: number; x: number; y: number } | null>(null);

  const rafRef = useRef<number>(0);
  const lastTickRef = useRef(0);
  const nextFrameTimeRef = useRef(0);

  // ── Transition helper ───────────────────────────────────────────────────
  const applyTransition = useCallback((next: SheepState, flip: boolean, vel: { x: number; y: number }) => {
    // Flower eating — advance bite stage (frames 5→6→7→8→gone)
    if (stateRef.current === 'graze' && eatingFlowerRef.current && flowerRef.current) {
      const nextFrame = flowerRef.current.frame + 1;
      if (nextFrame > 8) {
        // All 4 bites done — remove flower
        eatingFlowerRef.current = false;
        flowerRef.current = null;
        setFlowerEating(true);
        setTimeout(() => { setFlower(null); setFlowerEating(false); }, 400);
      } else {
        // Advance to next bite stage, keep flower, seek will re-trigger
        flowerRef.current = { ...flowerRef.current, frame: nextFrame };
        setFlower({ ...flowerRef.current });
      }
    }

    // Flower seek injection
    let resolved = next;
    if (flowerRef.current && (next === 'idle' || next === 'walk') && stateRef.current !== 'seek') {
      resolved = 'seek';
    }

    stateRef.current = resolved;
    frameIdxRef.current = 0;
    loopCycleRef.current = 0;
    const [lo, hi] = LOOP_CYCLES[resolved] ?? [40, 120];
    maxCyclesRef.current = Math.floor(lo + Math.random() * (hi - lo));
    const newAnim = ANIMS[resolved];
    if (newAnim.vx !== undefined) {
      vel.x = newAnim.vx * dirRef.current;
    } else if (['idle', 'sleep1a', 'sleep2a', 'graze', 'boing', 'burn', 'blacksheep', 'sit', 'bathtub'].includes(resolved)) {
      vel.x = 0;
    }
    if (flip) { dirRef.current = dirRef.current === 1 ? -1 : 1; vel.x = -vel.x; }

    // Kick off rotation clock when entering spin/roll via a normal transition
    if (resolved === 'spin' || resolved === 'roll_move') {
      rotStartTsRef.current = performance.now();
    }

    // Jump-down windup state needs a clean launch flag and fall-height anchor
    if (resolved === 'jump_down') {
      jumpLaunchedRef.current = false;
      fallStartYRef.current = posRef.current.y;
      vel.x = 0; vel.y = 0;
    }

    // Spawn bathtub prop when entering bathtub state from idle
    if (resolved === 'bathtub') {
      const pos = posRef.current;
      const W = window.innerWidth;
      const H = window.innerHeight;
      const btX = Math.max(0, Math.min(W - S_FW - 4, pos.x - S_FW / 4));
      const btY = H - S_FH;
      bathtubPropRef.current = { x: btX, y: btY, frame: 2, startTs: performance.now() };
      setBathtubProp({ x: btX, y: btY, frame: 2 });
    }

    // Scmpoo companion animations — set up poo display or clear it
    const POO_STATES: SheepState[] = ['poo_sleep', 'poo_sit', 'poo_yawn', 'poo_roll'];
    // Clear poo display when leaving a poo state
    if (!POO_STATES.includes(resolved) && POO_STATES.includes(stateRef.current as SheepState)) {
      pooRef.current = null;
      setPooDisplay(null);
    }
    if (POO_STATES.includes(resolved)) {
      const pos = posRef.current;
      const startTs = performance.now();
      if (resolved === 'poo_sleep') {
        pooRef.current = { sheet: scmpoo103, frames: [0, 1, 0, 1, 0, 1], frameDuration: 500, startTs };
      } else if (resolved === 'poo_sit') {
        pooRef.current = { sheet: scmpoo103, frames: [2, 3, 4, 3, 4, 3, 2], frameDuration: 400, startTs };
      } else if (resolved === 'poo_yawn') {
        pooRef.current = { sheet: scmpoo103, frames: [5, 6, 7, 6, 7, 5], frameDuration: 320, startTs };
      } else if (resolved === 'poo_roll') {
        pooRef.current = { sheet: scmpoo108, frames: [7, 8, 9, 10, 9, 8, 7], frameDuration: 200, startTs };
      }
      // Show poo sprite aligned with sheep position (centred, bottom-aligned)
      const pooRenderedH = Math.round(S_FH * POO_SCALE);
      const px = pos.x;
      const py = pos.y + (RENDER_H - pooRenderedH);
      setPooDisplay({ sheet: pooRef.current!.sheet, frame: pooRef.current!.frames[0], x: px, y: py });
    } else if (POO_STATES.includes(stateRef.current)) {
      // Transitioning OUT of a poo state — clear it
      pooRef.current = null;
      setPooDisplay(null);
    }
  }, []);

  // ── Special event spawners ──────────────────────────────────────────────
  const triggerBurn = useCallback(() => {
    const W = window.innerWidth;
    const fromLeft = Math.random() < 0.5;
    // Teleport to top corner
    posRef.current.x = fromLeft ? 0 : W - RENDER_W;
    posRef.current.y = -RENDER_H;
    // Fly diagonally toward opposite side; gravity arcs it down
    velRef.current.x = fromLeft ? 2.5 : -2.5;
    velRef.current.y = 0;
    dirRef.current = fromLeft ? 1 : -1;
    stateRef.current = 'burn';
    frameIdxRef.current = 0;
    loopCycleRef.current = 0;
    sfx.burnLand();
  }, []);

  const triggerBoing = useCallback(() => {
    stateRef.current = 'boing';
    velRef.current.x = 0;
    frameIdxRef.current = 0;
    loopCycleRef.current = 0;
    sfx.boing();
  }, []);

  const triggerQuirk = useCallback((quirk: 'blink' | 'yawn_quirk' | 'baa' | 'sneeze' | 'amazed' | 'blush') => {
    const blocked: SheepState[] = ['drag', 'fall', 'burn', 'ufo_caught', 'climb_up', 'top_walk', 'climb_down', 'pee', 'boing'];
    if (blocked.includes(stateRef.current)) return;
    stateRef.current = quirk;
    velRef.current.x = 0;
    frameIdxRef.current = 0;
    loopCycleRef.current = 0;
    const say = window.sheepSay?.say;
    if (!say) return;
    switch (quirk) {
      case 'yawn_quirk': say({ text: '*yawn*', emoji: '😴', tint: 'neutral', durationMs: 2200 }); break;
      case 'baa':        say({ text: 'baa.', emoji: '🐑', tint: 'neutral', durationMs: 1800 }); sfx.baa(); break;
      case 'sneeze':     say({ text: 'ACHOO!', emoji: '🤧', tint: 'neutral', durationMs: 1600 }); sfx.sneeze(); break;
      case 'amazed':     say({ text: '!?', emoji: '✨', tint: 'neutral', durationMs: 1600 }); break;
      case 'blush':      say({ text: '…', emoji: '💗', tint: 'neutral', durationMs: 1800 }); break;
      // blink has no bubble
    }
  }, []);

  const triggerEatFile = useCallback((filename: string) => {
    const blocked: SheepState[] = [
      'drag', 'fall', 'burn', 'ufo_caught', 'climb_up', 'top_walk', 'climb_down',
      'climb_prep', 'pee', 'boing', 'blacksheep', 'bathtub', 'jump_down',
      'land_hard', 'land_soft',
    ];
    if (blocked.includes(stateRef.current)) return;
    stateRef.current = 'graze';
    velRef.current.x = 0;
    frameIdxRef.current = 0;
    loopCycleRef.current = 0;
    nextFrameTimeRef.current = performance.now();
    const ext = (filename.split('.').pop() ?? '').toLowerCase();
    const reactions: Record<string, { text: string; emoji: string }> = {
      pdf:  { text: 'Crunchy PDF — needs salt.',   emoji: '📄' },
      png:  { text: 'Pixels. Tastes like pixels.', emoji: '🖼️' },
      jpg:  { text: 'Lightly compressed, nice.',   emoji: '🖼️' },
      jpeg: { text: 'Lightly compressed, nice.',   emoji: '🖼️' },
      gif:  { text: 'Wiggly snack!',                emoji: '🎞️' },
      svg:  { text: 'Vector fibre — chewy.',        emoji: '✏️' },
      mp4:  { text: 'Cinematic fibre.',             emoji: '🎬' },
      mov:  { text: 'Cinematic fibre.',             emoji: '🎬' },
      mp3:  { text: 'Mmm, mouth-music.',            emoji: '🎵' },
      wav:  { text: 'Mmm, mouth-music.',            emoji: '🎵' },
      js:   { text: 'Tastes async.',                emoji: '🧃' },
      ts:   { text: 'Typed and tasty.',             emoji: '🥖' },
      tsx:  { text: 'JSX chew toy.',                emoji: '🧀' },
      jsx:  { text: 'JSX chew toy.',                emoji: '🧀' },
      json: { text: 'Crunchy braces.',              emoji: '🥨' },
      md:   { text: 'Marked down, marked up.',      emoji: '📝' },
      txt:  { text: 'Plain oats.',                  emoji: '🌾' },
      html: { text: 'Tag salad.',                   emoji: '🥗' },
      css:  { text: 'Styled snack.',                emoji: '💅' },
      zip:  { text: 'Compressed. Burp.',            emoji: '💨' },
      dmg:  { text: 'Binary apples.',               emoji: '💿' },
      app:  { text: 'Heavy meal.',                  emoji: '📦' },
      py:   { text: 'Slithers down nicely.',        emoji: '🐍' },
      go:   { text: 'Gopher flavoured.',            emoji: '🐹' },
      rs:   { text: 'Rusty aftertaste.',            emoji: '🦀' },
      sh:   { text: 'Shell. Chewy.',                emoji: '🐚' },
      sql:  { text: 'DROP TABLE snack;',             emoji: '🗃️' },
    };
    const pick = reactions[ext] ?? {
      text: ext ? `Weird — tastes like .${ext}.` : 'Uh. Mystery snack.',
      emoji: '🍽️',
    };
    window.sheepSay?.say({ ...pick, tint: 'neutral', durationMs: 4000 });
  }, []);

  const triggerJumpDown = useCallback(() => {
    const blocked: SheepState[] = [
      'drag', 'fall', 'burn', 'ufo_caught', 'climb_up', 'top_walk', 'climb_down',
      'climb_prep', 'pee', 'boing', 'blacksheep', 'bathtub', 'jump_down',
    ];
    if (blocked.includes(stateRef.current)) return;
    stateRef.current = 'jump_down';
    frameIdxRef.current = 0;
    loopCycleRef.current = 0;
    velRef.current.x = 0;
    velRef.current.y = 0;
    jumpLaunchedRef.current = false;
    fallStartYRef.current = posRef.current.y;
  }, []);

  const triggerMovementQuirk = useCallback((kind: 'spin' | 'roll_move' | 'look_down' | 'turn_around') => {
    const blocked: SheepState[] = [
      'drag', 'fall', 'burn', 'ufo_caught', 'climb_up', 'top_walk', 'climb_down',
      'climb_prep', 'pee', 'boing', 'blacksheep', 'bathtub',
    ];
    if (blocked.includes(stateRef.current)) return;
    stateRef.current = kind;
    const animVx = ANIMS[kind].vx;
    velRef.current.x = animVx !== undefined ? animVx * dirRef.current : 0;
    frameIdxRef.current = 0;
    loopCycleRef.current = 0;
    if (kind === 'spin' || kind === 'roll_move') {
      rotStartTsRef.current = performance.now();
    }
    if (kind === 'look_down') {
      window.sheepSay?.say({ text: '…hm?', emoji: '👀', tint: 'neutral', durationMs: 1600 });
    }
  }, []);

  const triggerPee = useCallback(() => {
    const blocked: SheepState[] = ['drag', 'fall', 'burn', 'ufo_caught', 'climb_up', 'top_walk', 'climb_down', 'pee'];
    if (blocked.includes(stateRef.current)) return;
    stateRef.current = 'pee';
    velRef.current.x = 0;
    frameIdxRef.current = 0;
    loopCycleRef.current = 0;
    // Puddle anchors at the sheep's feet, slightly behind (trailing the facing direction).
    const feetX = posRef.current.x + RENDER_W / 2 - (dirRef.current === 1 ? 12 : -12);
    const feetY = posRef.current.y + RENDER_H - 4;
    puddleRef.current = { x: feetX, y: feetY, startTs: performance.now() };
    // Trickle sound starts when the pee squat begins; trigger sfx after the prep phase.
    setTimeout(() => sfx.pee(), 800);
  }, []);

  const triggerClimb = useCallback(() => {
    const pos = posRef.current;
    const W = window.innerWidth;
    climbEdgeRef.current = pos.x < W / 2 ? 'left' : 'right';
    // Walk to a random midpoint (40-60% of screen) so the top walk is short and reliable
    climbTopTargetXRef.current = W * 0.4 + Math.random() * (W * 0.2);
    stateRef.current = 'climb_prep';
    frameIdxRef.current = 0;
    loopCycleRef.current = 0;
  }, []);

  const triggerBlacksheep = useCallback(() => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const fromLeft = Math.random() < 0.5;
    secondSheepRef.current = {
      x: fromLeft ? -RENDER_W : W + RENDER_W,
      y: H - RENDER_H,
      dir: fromLeft ? 1 : -1,
      phase: 'approach',
      frame: 155,
      nextFrameTime: 0,
    };
    setSecondSheepDisplay({ ...secondSheepRef.current });
  }, []);

  const triggerUFO = useCallback(() => {
    const pos = posRef.current;
    const W = window.innerWidth;
    ufoRef.current = {
      x: Math.random() * (W - S_FW),
      y: -S_FH,
      targetX: pos.x - 20,
      phase: 'descend',
      isEncounter: false,
      alienY: 0,
      alienWaveStart: 0,
    };
    setUfoDisplay({ x: ufoRef.current.x, y: ufoRef.current.y, beamH: 0, phase: 'descend', ufoFrame: 0 });
    sfx.ufoHum();
  }, []);

  const triggerAlienEncounter = useCallback(() => {
    const pos = posRef.current;
    const W = window.innerWidth;
    // Land alien 60-90px to one side of the sheep so they're near but not overlapping
    const side = Math.random() < 0.5 ? 1 : -1;
    const offsetX = 60 + Math.random() * 30;
    const alienLandX = Math.max(S_FW, Math.min(W - S_FW * 2, pos.x + side * offsetX));
    ufoRef.current = {
      x: Math.random() * (W - S_FW),
      y: -S_FH,
      targetX: alienLandX, // UFO hovers over alien's landing spot
      phase: 'descend',
      isEncounter: true,
      alienY: 0,
      alienWaveStart: 0,
    };
    setUfoDisplay({ x: ufoRef.current.x, y: ufoRef.current.y, beamH: 0, phase: 'descend', ufoFrame: 0 });
    sfx.ufoHum();
  }, []);

  const triggerPooState = useCallback((state: 'poo_sleep' | 'poo_sit' | 'poo_yawn' | 'poo_roll') => {
    if (dragRef.current) return;
    // Clear any active poo first
    pooRef.current = null;
    setPooDisplay(null);
    const pos = posRef.current;
    const startTs = performance.now();
    let frames: number[];
    let sheet: string;
    let frameDuration: number;
    if (state === 'poo_sleep') {
      frames = [0, 1, 0, 1, 0, 1]; sheet = scmpoo103; frameDuration = 500;
    } else if (state === 'poo_sit') {
      frames = [2, 3, 4, 3, 4, 3, 2]; sheet = scmpoo103; frameDuration = 400;
    } else if (state === 'poo_yawn') {
      frames = [5, 6, 7, 6, 7, 5]; sheet = scmpoo103; frameDuration = 320;
    } else { // poo_roll
      frames = [7, 8, 9, 10, 9, 8, 7]; sheet = scmpoo108; frameDuration = 200;
    }
    pooRef.current = { sheet, frames, frameDuration, startTs };
    const pooRenderedH = Math.round(S_FH * POO_SCALE);
    const px = pos.x;
    const py = pos.y + (RENDER_H - pooRenderedH);
    setPooDisplay({ sheet, frame: frames[0], x: px, y: py });
    stateRef.current = state;
    velRef.current.x = 0;
    frameIdxRef.current = 0;
    loopCycleRef.current = 0;
  }, []);

  const triggerSpecialEvent = useCallback(() => {
    if (dragRef.current) return;
    const blocked: SheepState[] = ['climb_up', 'top_walk', 'climb_down', 'climb_prep', 'blacksheep', 'ufo_caught', 'boing', 'burn', 'bathtub', 'drag', 'fall', 'poo_sleep', 'poo_sit', 'poo_yawn', 'poo_roll'];
    if (blocked.includes(stateRef.current)) return;
    if (secondSheepRef.current) return;
    if (ufoRef.current) return;

    const r = Math.random();
    if (r < 0.18)      triggerBurn();
    else if (r < 0.36) triggerBoing();
    else if (r < 0.52) triggerClimb();
    else if (r < 0.68) triggerBlacksheep();
    else if (r < 0.84) triggerUFO();
    else               triggerAlienEncounter();
  }, [triggerBurn, triggerBoing, triggerClimb, triggerBlacksheep, triggerUFO, triggerAlienEncounter]);

  // ── RAF tick ────────────────────────────────────────────────────────────
  const tick = useCallback((ts: number) => {
    rafRef.current = requestAnimationFrame(tick);
    lastTickRef.current = ts;

    const pos = posRef.current;
    const vel = velRef.current;
    const W = window.innerWidth;
    const H = window.innerHeight;

    // ── Drag ──────────────────────────────────────────────────────────────
    if (dragRef.current) {
      setDisplayPos({ ...pos });
      return;
    }

    // ── UFO update ────────────────────────────────────────────────────────
    const ufo = ufoRef.current;
    if (ufo) {
      // Animate scmpoo111 UFO saucer: frames 0-5 cycle
      const ufoSaucerFrame = Math.floor(ts / 120) % 6;
      if (ufo.phase === 'descend') {
        // UFO hovers at ~25% down the screen — long dramatic beam
        // Encounter: hover over alien landing spot (offset from sheep). Abduction: hover over sheep.
        const tx = ufo.isEncounter ? ufo.targetX : pos.x - 20;
        const ty = H * 0.25;
        ufo.x += (tx - ufo.x) * 0.04;
        ufo.y += (ty - ufo.y) * 0.04;
        const beamH = Math.max(0, pos.y - (ufo.y + S_FH));
        setUfoDisplay({ x: ufo.x, y: ufo.y, beamH, phase: 'descend', ufoFrame: ufoSaucerFrame });
        if (Math.abs(ufo.y - ty) < 8 && Math.abs(ufo.x - tx) < 12) {
          if (ufo.isEncounter) {
            ufo.phase = 'alien_arrive';
            ufo.alienY = ufo.y + S_FH; // alien starts at UFO bottom
          } else {
            ufo.phase = 'beam';
            stateRef.current = 'ufo_caught';
            velRef.current.x = 0;
            frameIdxRef.current = 0;
          }
        }
      } else if (ufo.phase === 'beam') {
        // UFO rises; sheep is pulled up the beam toward UFO
        ufo.y -= 2;
        const targetSheepY = ufo.y + S_FH + 4;
        pos.x = ufo.x + S_FW / 2 - Math.round(RENDER_W / 2);
        pos.y = Math.max(pos.y - 4, targetSheepY); // pulled up 4px/frame, locks at UFO
        vel.x = 0; vel.y = 0;
        const abductFrame = 9 + Math.floor(ts / 100) % 4;
        const beamH = Math.max(4, pos.y - (ufo.y + S_FH));
        setUfoDisplay({ x: ufo.x, y: ufo.y, beamH, phase: 'beam', ufoFrame: abductFrame });
        if (ufo.y < -S_FH - RENDER_H - 20) {
          pos.x = RENDER_W * 2 + Math.random() * (W - RENDER_W * 4);
          pos.y = H - RENDER_H;
          vel.y = -3;
          stateRef.current = 'fall';
          frameIdxRef.current = 0;
          fallStartYRef.current = pos.y;
          ufo.phase = 'depart';
          setUfoDisplay({ x: ufo.x, y: ufo.y, beamH: 0, phase: 'depart', ufoFrame: ufoSaucerFrame });
        }
      } else if (ufo.phase === 'alien_arrive') {
        // Alien descends from UFO bottom all the way to ground; beam visible
        const groundY = H - S_FH;
        ufo.alienY = Math.min(ufo.alienY + 3, groundY);
        const ufoBottom = ufo.y + S_FH;
        const beamH = Math.max(0, ufo.alienY - ufoBottom);
        const alienFrame = 6 + Math.floor(ts / 140) % 3;
        setUfoDisplay({ x: ufo.x, y: ufo.y, beamH, phase: 'alien_arrive', ufoFrame: ufoSaucerFrame });
        setAlienDisplay({ x: ufo.x, y: ufo.alienY, frame: alienFrame });
        if (ufo.alienY >= groundY) {
          ufo.phase = 'alien_wave';
          ufo.alienWaveStart = ts;
        }
      } else if (ufo.phase === 'alien_wave') {
        // Alien waves on the ground for ~3 seconds, no beam
        const groundY = H - S_FH;
        const alienFrame = 6 + Math.floor(ts / 180) % 3;
        setUfoDisplay({ x: ufo.x, y: ufo.y, beamH: 0, phase: 'alien_wave', ufoFrame: ufoSaucerFrame });
        setAlienDisplay({ x: ufo.x, y: groundY, frame: alienFrame });
        if (ts - ufo.alienWaveStart > 3200) {
          ufo.phase = 'alien_leave';
          ufo.alienY = groundY;
        }
      } else if (ufo.phase === 'alien_leave') {
        // Alien ascends back up to UFO, then UFO departs
        const ufoBottom = ufo.y + S_FH;
        ufo.alienY = Math.max(ufo.alienY - 3, ufoBottom);
        const beamH = Math.max(0, ufo.alienY - ufoBottom);
        const alienFrame = 6 + Math.floor(ts / 140) % 3;
        setUfoDisplay({ x: ufo.x, y: ufo.y, beamH, phase: 'alien_leave', ufoFrame: ufoSaucerFrame });
        if (ufo.alienY <= ufoBottom) {
          setAlienDisplay(null);
          ufo.phase = 'depart';
        } else {
          setAlienDisplay({ x: ufo.x, y: ufo.alienY, frame: alienFrame });
        }
      } else if (ufo.phase === 'depart') {
        ufo.y -= 4;
        ufo.x += (Math.random() - 0.5) * 2;
        if (ufo.y < -160) {
          ufoRef.current = null;
          setUfoDisplay(null);
          setAlienDisplay(null);
        } else {
          setUfoDisplay({ x: ufo.x, y: ufo.y, beamH: 0, phase: 'depart', ufoFrame: ufoSaucerFrame });
        }
      }
    }

    // ── Puddle animation ──────────────────────────────────────────────────
    const pd = puddleRef.current;
    if (pd) {
      const elapsed = ts - pd.startTs;
      const PEE_PREP_MS = 800;
      const PEE_GROW_MS = 2000;
      const PEE_HOLD_MS = 5000;
      const PEE_FADE_MS = 4000;
      const MAX_W = 36;
      const MAX_H = 7;
      let w = 0, h = 0, alpha = 0;
      if (elapsed < PEE_PREP_MS) {
        w = 0; h = 0; alpha = 0;
      } else if (elapsed < PEE_PREP_MS + PEE_GROW_MS) {
        const g = (elapsed - PEE_PREP_MS) / PEE_GROW_MS;
        w = MAX_W * g; h = MAX_H * g; alpha = 0.85;
      } else if (elapsed < PEE_PREP_MS + PEE_GROW_MS + PEE_HOLD_MS) {
        w = MAX_W; h = MAX_H; alpha = 0.85;
      } else if (elapsed < PEE_PREP_MS + PEE_GROW_MS + PEE_HOLD_MS + PEE_FADE_MS) {
        const f = (elapsed - PEE_PREP_MS - PEE_GROW_MS - PEE_HOLD_MS) / PEE_FADE_MS;
        w = MAX_W; h = MAX_H; alpha = 0.85 * (1 - f);
      } else {
        puddleRef.current = null;
        setPuddle(null);
      }
      if (puddleRef.current) {
        setPuddle({ x: pd.x, y: pd.y, w, h, alpha });
      }
    }

    // ── Dust puff (hard landing) ──────────────────────────────────────────
    const dust = dustPuffRef.current;
    if (dust) {
      const elapsed = ts - dust.startTs;
      const LIFE_MS = 700;
      if (elapsed >= LIFE_MS) {
        dustPuffRef.current = null;
        setDustPuff(null);
      } else {
        const p = elapsed / LIFE_MS;
        setDustPuff({
          x: dust.x,
          y: dust.y,
          scale: 1 + p * 2.2,
          alpha: 0.65 * (1 - p),
        });
      }
    }

    // ── Bathtub prop animation ─────────────────────────────────────────────
    const btProp = bathtubPropRef.current;
    if (btProp) {
      const elapsed = ts - btProp.startTs;
      // splash=true (burn landing): skip empty tub, start with water splash → steam
      // splash=false (idle bathtub): empty tub → water → steam
      const newFrame = btProp.splash
        ? (elapsed < 800 ? 3 : 4)
        : (elapsed < 400 ? 2 : elapsed < 900 ? 3 : 4);
      if (newFrame !== btProp.frame) {
        btProp.frame = newFrame;
        setBathtubProp({ x: btProp.x, y: btProp.y, frame: newFrame, splash: btProp.splash });
      }
      if (elapsed > 3500) {
        bathtubPropRef.current = null;
        setBathtubProp(null);
      }
    }

    // ── Scmpoo companion animation update ─────────────────────────────────
    const poo = pooRef.current;
    if (poo) {
      const elapsed = ts - poo.startTs;
      const totalDuration = poo.frames.length * poo.frameDuration;
      if (elapsed >= totalDuration) {
        // Animation finished — clear companion display
        pooRef.current = null;
        setPooDisplay(null);
      } else {
        const frameIdx = Math.floor(elapsed / poo.frameDuration);
        const frame = poo.frames[frameIdx];
        const pooRenderedH = Math.round(S_FH * POO_SCALE);
        const px = pos.x;
        const py = pos.y + (RENDER_H - pooRenderedH);
        setPooDisplay({ sheet: poo.sheet, frame, x: px, y: py });
      }
    }

    // ── Second sheep update ───────────────────────────────────────────────
    const ss = secondSheepRef.current;
    if (ss) {
      const speed = 2.2;
      if (ss.phase === 'approach') {
        ss.x += speed * ss.dir;
        // Animate frame
        if (ts >= ss.nextFrameTime) {
          ss.frame = ss.frame === 155 ? 154 : 155;
          ss.nextFrameTime = ts + 160;
        }
        // Check proximity to main sheep
        if (Math.abs(ss.x - pos.x) < RENDER_W * 3) {
          ss.phase = 'encounter';
          ss.frame = 157;
          // Main sheep reacts
          if (!['blacksheep', 'drag', 'fall', 'ufo_caught'].includes(stateRef.current)) {
            stateRef.current = 'blacksheep';
            velRef.current.x = 0;
            frameIdxRef.current = 0;
          }
        }
      } else if (ss.phase === 'encounter') {
        // Hold for a beat while main sheep plays encounter anim
        if (stateRef.current !== 'blacksheep') {
          ss.phase = 'leave';
          ss.frame = 155;
        }
      } else if (ss.phase === 'leave') {
        ss.x += speed * ss.dir;
        if (ts >= ss.nextFrameTime) {
          ss.frame = ss.frame === 155 ? 154 : 155;
          ss.nextFrameTime = ts + 160;
        }
        if (ss.x < -RENDER_W * 2 || ss.x > W + RENDER_W * 2) {
          secondSheepRef.current = null;
          setSecondSheepDisplay(null);
          return;
        }
      }
      setSecondSheepDisplay({ ...ss });
    }

    // ── Climb state special physics ───────────────────────────────────────
    if (stateRef.current === 'climb_prep') {
      const edgeX = climbEdgeRef.current === 'left' ? 0 : W - RENDER_W;
      const dx = edgeX - pos.x;
      dirRef.current = climbEdgeRef.current === 'right' ? 1 : -1;
      vel.x = 0.6 * (dx > 0 ? 1 : -1);
      if (Math.abs(dx) < 4) {
        pos.x = edgeX;
        vel.x = 0; vel.y = 0;
        stateRef.current = 'climb_up';
        frameIdxRef.current = 0;
        loopCycleRef.current = 0;
        setFlipY(false);
      }
    } else if (stateRef.current === 'climb_up') {
      pos.x = climbEdgeRef.current === 'left' ? 0 : W - RENDER_W;
      vel.x = 0; vel.y = -1.5;
      if (pos.y <= -RENDER_H) {
        pos.y = -RENDER_H;
        vel.y = 0;
        stateRef.current = 'top_walk';
        frameIdxRef.current = 0;
        loopCycleRef.current = 0;
        setFlipY(true);
        const targetX = climbTopTargetXRef.current;
        vel.x = 0.8 * (targetX > pos.x ? 1 : -1);
        dirRef.current = vel.x > 0 ? 1 : -1;
      }
    } else if (stateRef.current === 'top_walk') {
      pos.y = -RENDER_H;
      vel.y = 0;
      const targetX = climbTopTargetXRef.current;
      vel.x = 3.0 * (targetX > pos.x ? 1 : -1);
      dirRef.current = vel.x > 0 ? 1 : -1;
      if (Math.abs(pos.x - targetX) < 6) {
        pos.x = targetX;
        vel.x = 0;
        stateRef.current = 'climb_down';
        frameIdxRef.current = 0;
        loopCycleRef.current = 0;
        setFlipY(false);
        // Descend from whichever edge is nearest to current position
        climbEdgeRef.current = pos.x < window.innerWidth / 2 ? 'left' : 'right';
      }
    } else if (stateRef.current === 'climb_down') {
      pos.x = climbEdgeRef.current === 'left' ? 0 : W - RENDER_W;
      vel.x = 0; vel.y = 1.5;
      if (pos.y >= H - RENDER_H) {
        pos.y = H - RENDER_H;
        vel.y = 0;
        stateRef.current = 'idle';
        frameIdxRef.current = 0;
        loopCycleRef.current = 0;
      }
    }

    // ── UFO caught — move upward (skipped when beam is active; position locked above) ──
    if (stateRef.current === 'ufo_caught' && !(ufo && ufo.phase === 'beam')) {
      vel.y = -3;
      vel.x = 0;
    }

    // ── Seek flower ───────────────────────────────────────────────────────
    if (stateRef.current === 'seek' && flowerRef.current) {
      const dx = flowerRef.current.x - pos.x;
      dirRef.current = dx > 0 ? 1 : -1;
      vel.x = ANIMS.seek.vx! * dirRef.current;
      if (Math.abs(dx) < RENDER_W * 1.5) {
        vel.x = 0;
        eatingFlowerRef.current = true;
        stateRef.current = 'graze';
        frameIdxRef.current = 0;
        loopCycleRef.current = 0;
        nextFrameTimeRef.current = ts;
      }
    } else if (stateRef.current === 'seek' && !flowerRef.current) {
      stateRef.current = 'idle'; vel.x = 0; frameIdxRef.current = 0;
    }

    // ── Jump-down windup / launch ─────────────────────────────────────────
    if (stateRef.current === 'jump_down') {
      if (frameIdxRef.current < 4) {
        // Windup poses — hold in place
        vel.x = 0; vel.y = 0;
      } else if (!jumpLaunchedRef.current) {
        jumpLaunchedRef.current = true;
        vel.x = 2.2 * dirRef.current;
        vel.y = -7;
        fallStartYRef.current = pos.y;
      }
    }

    // ── Gravity ───────────────────────────────────────────────────────────
    if (stateRef.current === 'fall') {
      vel.y = Math.min(vel.y + 0.4, 10);
    } else if (stateRef.current === 'burn') {
      vel.y = Math.min(vel.y + 0.18, 5); // slower arc for burn — more hang time
    } else if (stateRef.current === 'jump_down' && jumpLaunchedRef.current) {
      vel.y = Math.min(vel.y + 0.4, 10);
    }

    // ── Apply velocity ────────────────────────────────────────────────────
    pos.x += vel.x * speedMulRef.current;
    pos.y += vel.y;

    // ── Floor collision ───────────────────────────────────────────────────
    const isClimbing = ['climb_up', 'top_walk', 'climb_down', 'climb_prep', 'ufo_caught'].includes(stateRef.current);

    // Resolve effective floor: the window titlebar wins over the world floor
    // when the sheep is horizontally above it and either (a) already standing
    // on it or (b) falling down onto it from above.
    const worldFloorY = H - RENDER_H;
    const win = windowRectRef.current;
    const centerX = pos.x + RENDER_W / 2;
    let floorY = worldFloorY;
    let floorOnWindow = false;
    if (win) {
      const winTopY = win.y - RENDER_H;
      const overX = centerX >= win.x + 6 && centerX <= win.x + win.w - 6;
      const validWin = winTopY > 8 && winTopY < worldFloorY;
      if (validWin && overX) {
        if (onWindowRef.current) {
          floorY = winTopY;
          floorOnWindow = true;
        } else {
          const prevY = pos.y - vel.y;
          const cameFromAbove = prevY + RENDER_H <= win.y + 2;
          // If the sheep is released from a drag such that its bottom is inside
          // the titlebar band (within ~30px of window top), snap it to sit on
          // the titlebar even though it isn't strictly "above" the window.
          const bottomY = pos.y + RENDER_H;
          const inTitlebarBand = bottomY >= win.y - 2 && bottomY <= win.y + 30;
          const fallingState = stateRef.current === 'fall'
            || stateRef.current === 'burn'
            || (stateRef.current === 'jump_down' && jumpLaunchedRef.current);
          if ((fallingState && cameFromAbove) || (fallingState && inTitlebarBand)) {
            floorY = winTopY;
            floorOnWindow = true;
          }
        }
      }
    }

    // Walked off the window titlebar (or window disappeared) while grounded
    if (!isClimbing && onWindowRef.current && !floorOnWindow) {
      const groundedStates: SheepState[] = [
        'idle','walk','sit','sleep1a','sleep2a','graze','seek','boing',
        'blink','yawn_quirk','baa','sneeze','amazed','blush',
        'spin','roll_move','look_down','turn_around','land_soft','land_hard',
      ];
      if (groundedStates.includes(stateRef.current)) {
        onWindowRef.current = false;
        stateRef.current = 'fall';
        fallStartYRef.current = pos.y;
        frameIdxRef.current = 0;
        loopCycleRef.current = 0;
        vel.x = 0;
      }
    }

    if (!isClimbing && pos.y >= floorY) {
      pos.y = floorY;
      vel.y = 0;
      const landed = stateRef.current === 'fall'
        || stateRef.current === 'drag'
        || (stateRef.current === 'jump_down' && jumpLaunchedRef.current);
      const wasOnWindow = onWindowRef.current;
      onWindowRef.current = floorOnWindow;
      if (landed) {
        vel.x = 0;
        const drop = pos.y - fallStartYRef.current;
        if (drop >= 220) {
          stateRef.current = 'land_hard';
          dustPuffRef.current = { x: pos.x + RENDER_W / 2, y: pos.y + RENDER_H - 2, startTs: ts };
          sfx.thud();
        } else if (drop >= 60) {
          stateRef.current = 'land_soft';
        } else {
          stateRef.current = 'idle';
        }
        frameIdxRef.current = 0;
        loopCycleRef.current = 0;
        jumpLaunchedRef.current = false;
      } else if (stateRef.current === 'burn' && !floorOnWindow && !wasOnWindow) {
        // Sheep lands — splash into the filling tub and lounge there until the soak ends.
        vel.x = 0;
        stateRef.current = 'bathtub';
        frameIdxRef.current = 0;
        loopCycleRef.current = 0;
        const btX = Math.max(0, Math.min(W - S_FW - 4, pos.x - S_FW / 4));
        const btY = H - S_FH;
        bathtubPropRef.current = { x: btX, y: btY, frame: 3, startTs: ts, splash: true };
        setBathtubProp({ x: btX, y: btY, frame: 3, splash: true });
        sfx.splash();
      }
    }

    // ── Wall bounce (skip during climbing, ufo_caught, and burn diagonal flight) ───
    if (!isClimbing && stateRef.current !== 'burn') {
      if (pos.x < 0) { pos.x = 0; vel.x = Math.abs(vel.x); dirRef.current = 1; }
      if (pos.x > W - RENDER_W) { pos.x = W - RENDER_W; vel.x = -Math.abs(vel.x); dirRef.current = -1; }
    }

    // ── Animate frames ────────────────────────────────────────────────────
    if (ts >= nextFrameTimeRef.current) {
      const anim = ANIMS[stateRef.current];
      frameIdxRef.current++;
      if (frameIdxRef.current >= anim.frames.length) {
        frameIdxRef.current = 0;
        if (anim.loop) {
          // Skip cycle counting for climb states (controlled above)
          if (!['climb_up', 'top_walk', 'climb_down'].includes(stateRef.current)) {
            loopCycleRef.current++;
            if (loopCycleRef.current >= maxCyclesRef.current) {
              const next = anim.next?.() ?? 'idle';
              const flip = !['graze', 'seek', 'blacksheep', 'boing'].includes(next) && Math.random() < 0.35;
              applyTransition(next, false, vel);
              if (flip) { dirRef.current = dirRef.current === 1 ? -1 : 1; vel.x = -vel.x; }
            }
          }
        } else {
          const next = anim.next?.() ?? 'idle';
          const wasTurning = stateRef.current === 'turn_around';
          const flip = wasTurning
            ? true
            : !['graze', 'seek', 'blacksheep', 'boing', 'climb_up', 'top_walk', 'climb_down'].includes(next)
                && Math.random() < 0.35;
          applyTransition(next, flip, vel);
        }
      }

      const curAnim = ANIMS[stateRef.current];
      const curFrame = curAnim.frames[frameIdxRef.current] ?? curAnim.frames[0];
      nextFrameTimeRef.current = ts + curFrame.ms;
      setDisplayFrame(curFrame.idx);
    }

    setDisplayPos({ x: pos.x, y: pos.y });
    setDisplayDir(dirRef.current);

    // Spin / roll rotation — progress from 0 to totalDeg over the animation duration.
    if (stateRef.current === 'spin' || stateRef.current === 'roll_move') {
      const DURATION = stateRef.current === 'spin' ? 800 : 1400;
      const totalDeg = stateRef.current === 'spin' ? 360 : 720;
      const p = Math.min(1, (ts - rotStartTsRef.current) / DURATION);
      setDisplayRot(p * totalDeg * dirRef.current);
    } else {
      setDisplayRot(0);
    }

    // Report sheep bounds to Electron main so it can toggle click-through.
    // Slight inflation so the hover hit-area feels generous.
    window.smp?.reportSheepBounds({
      x: Math.round(pos.x - 4),
      y: Math.round(pos.y - 4),
      w: RENDER_W + 8,
      h: RENDER_H + 8,
    });
  }, [applyTransition]);

  // ── Effects ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [visible, tick]);

  // File-drop eat interaction
  useEffect(() => {
    if (!visible) return;
    let dragNoticed = false;
    const nearSheep = (cx: number, cy: number) => {
      const sx = posRef.current.x + RENDER_W / 2;
      const sy = posRef.current.y + RENDER_H / 2;
      const dx = cx - sx, dy = cy - sy;
      return (dx * dx + dy * dy) < 160 * 160;
    };
    const hasFiles = (dt: DataTransfer | null) => {
      if (!dt) return false;
      for (const t of Array.from(dt.types)) {
        if (t === 'Files' || t === 'application/x-moz-file') return true;
      }
      return false;
    };
    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault();                            // required to allow drop
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      if (!dragNoticed && nearSheep(e.clientX, e.clientY)) {
        dragNoticed = true;
        window.sheepSay?.say({ text: '…oh?', emoji: '👀', tint: 'neutral', durationMs: 1500 });
      }
    };
    const onDragLeave = (e: DragEvent) => {
      // Fires when leaving a target; reset only when leaving the window entirely
      if (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
        dragNoticed = false;
      }
    };
    const onDragEnd = () => { dragNoticed = false; };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      dragNoticed = false;
      if (!nearSheep(e.clientX, e.clientY)) return;
      const files = e.dataTransfer ? Array.from(e.dataTransfer.files) : [];
      if (files.length === 0) return;
      triggerEatFile(files[0].name);
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('dragend', onDragEnd);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('dragend', onDragEnd);
      window.removeEventListener('drop', onDrop);
    };
  }, [visible, triggerEatFile]);

  useEffect(() => {
    if (!visible) return;
    const onJump = () => {
      if (dragRef.current) return;
      velRef.current.y = -5;
      if (!['climb_up', 'top_walk', 'climb_down', 'ufo_caught', 'bathtub'].includes(stateRef.current)) {
        stateRef.current = 'fall';
        frameIdxRef.current = 0;
        fallStartYRef.current = posRef.current.y;
      }
    };
    window.addEventListener('sheep-jump', onJump);
    return () => window.removeEventListener('sheep-jump', onJump);
  }, [visible]);

  // Flower spawner
  useEffect(() => {
    if (!visible) return;
    const spawn = () => {
      if (flowerRef.current) return;
      const x = RENDER_W + Math.random() * (window.innerWidth - RENDER_W * 3);
      const y = window.innerHeight - RENDER_H;
      const f = { x, y, frame: 5 };
      flowerRef.current = f;
      setFlower(f);
    };
    const schedule = (): ReturnType<typeof setTimeout> => {
      return setTimeout(() => { spawn(); schedule(); }, 20000 + Math.random() * 25000);
    };
    const first = setTimeout(spawn, 15000);
    const recurring = schedule();
    return () => { clearTimeout(first); clearTimeout(recurring); };
  }, [visible]);

  // Expose event triggers to browser console for testing
  useEffect(() => {
    if (!visible) return;
    (window as any).sheep = {
      burn:       triggerBurn,
      boing:      triggerBoing,
      climb:      triggerClimb,
      blacksheep: triggerBlacksheep,
      ufo:        triggerUFO,
      alien:      triggerAlienEncounter,
      sleep:      () => triggerPooState('poo_sleep'),
      sit:        () => triggerPooState('poo_sit'),
      yawn:       () => triggerPooState('poo_yawn'),
      roll:       () => triggerPooState('poo_roll'),
      pee:        triggerPee,
      blink:      () => triggerQuirk('blink'),
      yawnQuirk:  () => triggerQuirk('yawn_quirk'),
      baa:        () => triggerQuirk('baa'),
      sneeze:     () => triggerQuirk('sneeze'),
      amazed:     () => triggerQuirk('amazed'),
      blush:      () => triggerQuirk('blush'),
      spin:       () => triggerMovementQuirk('spin'),
      rollMove:   () => triggerMovementQuirk('roll_move'),
      lookDown:   () => triggerMovementQuirk('look_down'),
      turnAround: () => triggerMovementQuirk('turn_around'),
      jumpDown:   triggerJumpDown,
      flower:     () => {
        const x = RENDER_W + Math.random() * (window.innerWidth - RENDER_W * 3);
        const y = window.innerHeight - RENDER_H;
        const f = { x, y, frame: 5 };
        flowerRef.current = f;
        setFlower(f);
      },
      jump:       () => window.dispatchEvent(new CustomEvent('sheep-jump')),
      random:     triggerSpecialEvent,
      getBounds:  () => ({ x: posRef.current.x, y: posRef.current.y, w: RENDER_W, h: RENDER_H }),
      forceSleep: () => {
        if (dragRef.current) return;
        const blocked: SheepState[] = ['drag', 'fall', 'ufo_caught', 'burn', 'climb_up', 'top_walk', 'climb_down'];
        if (blocked.includes(stateRef.current)) return;
        stateRef.current = 'sleep1a';
        velRef.current.x = 0;
        frameIdxRef.current = 0;
        loopCycleRef.current = 0;
      },
    };
    console.log('%c🐑 Sheep console commands ready', 'color: #00e5ff; font-weight: bold');
    console.log('  sheep.burn()       — on fire');
    console.log('  sheep.boing()      — bounce');
    console.log('  sheep.climb()      — climb screen edge');
    console.log('  sheep.blacksheep() — second sheep encounter');
    console.log('  sheep.ufo()        — UFO abduction');
    console.log('  sheep.alien()      — alien encounter');
    console.log('  sheep.sleep()      — sleeping zzz (scmpoo103)');
    console.log('  sheep.sit()        — sitting and staring (scmpoo103)');
    console.log('  sheep.yawn()       — big yawn (scmpoo103)');
    console.log('  sheep.pee()        — peeing (scmpoo108)');
    console.log('  sheep.flower()     — spawn a flower');
    console.log('  sheep.jump()       — jump');
    console.log('  sheep.spin()       — pirouette in place');
    console.log('  sheep.rollMove()   — roll along the ground');
    console.log('  sheep.lookDown()   — inspect the ground');
    console.log('  sheep.turnAround() — pivot to face the other way');
    console.log('  sheep.jumpDown()   — windup + leap (landing intensity varies with drop height)');
    console.log('  sheep.random()     — random special event');
    return () => { delete (window as any).sheep; };
  }, [visible, triggerBurn, triggerBoing, triggerClimb, triggerBlacksheep, triggerUFO, triggerAlienEncounter, triggerPooState, triggerSpecialEvent, triggerPee, triggerQuirk, triggerMovementQuirk, triggerJumpDown]);

  // Special events timer
  useEffect(() => {
    if (!visible) return;
    const schedule = (): ReturnType<typeof setTimeout> => {
      return setTimeout(() => { triggerSpecialEvent(); schedule(); }, 25000 + Math.random() * 35000);
    };
    const t = schedule();
    return () => clearTimeout(t);
  }, [visible, triggerSpecialEvent]);

  // ── Drag handler ─────────────────────────────────────────────────────────
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // only left-click drags; right-click handled by onContextMenu
    e.preventDefault();
    dragRef.current = true;
    stateRef.current = 'drag';
    frameIdxRef.current = 0;
    velHistRef.current = [];
    setFlipY(false);
    dragOffRef.current = { x: e.clientX - posRef.current.x, y: e.clientY - posRef.current.y };
    window.smp?.forceCapture(true); // hold mouse capture for the duration of the drag
    const onMove = (me: MouseEvent) => {
      const nx = me.clientX - dragOffRef.current.x;
      const ny = me.clientY - dragOffRef.current.y;
      velHistRef.current.push({ x: nx - posRef.current.x, y: ny - posRef.current.y });
      if (velHistRef.current.length > 5) velHistRef.current.shift();
      posRef.current.x = nx; posRef.current.y = ny;
      setDisplayPos({ x: nx, y: ny });
    };
    const onUp = () => {
      dragRef.current = false;
      if (velHistRef.current.length > 0) {
        const avg = velHistRef.current.reduce((a, b) => ({ x: a.x + b.x, y: a.y + b.y }), { x: 0, y: 0 });
        velRef.current.x = (avg.x / velHistRef.current.length) * 0.6;
        velRef.current.y = (avg.y / velHistRef.current.length) * 0.6;
      }
      stateRef.current = 'fall';
      frameIdxRef.current = 0;
      fallStartYRef.current = posRef.current.y;
      window.smp?.forceCapture(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  if (!visible) return null;

  const isTopWalk = stateRef.current === 'top_walk' || flipY;
  const extraTransform = isTopWalk ? 'scaleY(-1)' : '';

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 15000, overflow: 'hidden' }}>

      {/* Flower — scmpoo110 frames 5-8 (4 bite stages), 1× scale to match sheep size */}
      {flower && (
        <div style={{
          ...scmpooStyle(scmpoo110, flower.frame, flower.x, flower.y, 1),
          overflow: 'visible',
          transition: flowerEating ? 'transform 0.3s ease, opacity 0.3s ease' : 'none',
          transform: flowerEating ? 'scale(2)' : 'none',
          opacity: flowerEating ? 0 : 1,
        }} />
      )}

      {/* UFO — scmpoo111: frames 0-5 = saucer, 6-8 = alien, 9-12 = abduction */}
      {ufoDisplay && (
        <div style={{ position: 'fixed', left: ufoDisplay.x, top: ufoDisplay.y, pointerEvents: 'none' }}>
          {/* UFO saucer at scale=1 (40×40px) */}
          <div style={{
            ...scmpooStyle(scmpoo111, ufoDisplay.phase === 'beam' ? 0 : ufoDisplay.ufoFrame, 0, 0, 1),
            position: 'relative', filter: 'drop-shadow(0 0 6px #88ff88)',
          }} />
          {/* Beam — centered on UFO (UFO center = S_FW/2 = 20px) */}
          {ufoDisplay.beamH > 0 && (
            <div style={{
              position: 'absolute', left: S_FW / 2, top: S_FH - 4,
              width: 20, marginLeft: -10,
              height: ufoDisplay.beamH,
              background: 'linear-gradient(to bottom, rgba(160,255,120,0.8) 0%, rgba(160,255,120,0.05) 100%)',
              borderRadius: '0 0 10px 10px',
            }} />
          )}
        </div>
      )}

      {/* Alien (encounter event) — scmpoo111 frames 6-8 */}
      {alienDisplay && (
        <div style={scmpooStyle(scmpoo111, alienDisplay.frame, alienDisplay.x, alienDisplay.y, 1)} />
      )}

      {/* Second sheep (blacksheep encounter) — frames 154-157 face RIGHT natively, so flip logic is inverted */}
      {secondSheepDisplay && (
        <div style={sheepStyle(
          secondSheepDisplay.frame,
          (secondSheepDisplay.dir === 1 ? -1 : 1) as 1 | -1,
          secondSheepDisplay.x,
          secondSheepDisplay.y,
          { filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4)) sepia(0.8) hue-rotate(200deg)' },
        )} />
      )}

      {/* Main sheep — hidden during poo companion overlays to avoid bleed-through on transparent pixels.
          Invisible drag-target div kept alive so the pet is still draggable during poo animations. */}
      <div
        onMouseDown={onMouseDown}
        onContextMenu={(e) => { e.preventDefault(); window.smp?.showSheepMenu?.(); }}
        onDoubleClick={(e) => { e.preventDefault(); window.smp?.openPrefs?.(); }}
        style={sheepStyle(
          displayFrame, displayDir, displayPos.x, displayPos.y,
          {
            cursor: 'grab',
            pointerEvents: 'auto',
            visibility: pooDisplay || bathtubProp?.splash ? 'hidden' : 'visible',
            filter: stateRef.current === 'burn'
              ? 'drop-shadow(0 0 8px #ff6600) drop-shadow(0 0 16px #ff2200) brightness(1.2)'
              : stateRef.current === 'blush'
              ? 'drop-shadow(0 2px 4px rgba(0,0,0,0.4)) hue-rotate(320deg) saturate(1.6)'
              : stateRef.current === 'amazed'
              ? 'drop-shadow(0 2px 4px rgba(0,0,0,0.4)) brightness(1.15) saturate(1.3)'
              : 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))',
            transform: [
              displayDir === 1 ? 'scaleX(-1)' : '',
              extraTransform,
              displayRot !== 0 ? `rotate(${displayRot}deg)` : '',
            ].filter(Boolean).join(' ') || 'none',
          },
        )}
      />

      {/* Pee puddle — renders under (behind) the sheep */}
      {puddle && puddle.w > 0 && (
        <div
          style={{
            position: 'fixed',
            left: puddle.x - puddle.w / 2,
            top: puddle.y - puddle.h / 2,
            width: puddle.w,
            height: puddle.h,
            borderRadius: '50%',
            background: 'radial-gradient(ellipse at center, rgba(240,220,90,0.95) 0%, rgba(220,190,60,0.85) 60%, rgba(180,150,40,0.4) 100%)',
            opacity: puddle.alpha,
            boxShadow: '0 0 2px rgba(200,160,30,0.5), inset 1px 1px 0 rgba(255,240,160,0.6)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
      )}

      {/* Dust puff — brief poof kicked up by a hard landing */}
      {dustPuff && dustPuff.alpha > 0 && (
        <div
          style={{
            position: 'fixed',
            left: dustPuff.x - 18 * dustPuff.scale,
            top: dustPuff.y - 8 * dustPuff.scale,
            width: 36 * dustPuff.scale,
            height: 16 * dustPuff.scale,
            borderRadius: '50%',
            background: 'radial-gradient(ellipse at center, rgba(220,210,195,0.95) 0%, rgba(180,170,150,0.55) 55%, rgba(140,130,115,0) 100%)',
            opacity: dustPuff.alpha,
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
      )}

      {/* Bathtub prop — renders on top of sheep so sheep appears inside tub */}
      {bathtubProp && (
        <div style={scmpooStyle(scmpoo110, bathtubProp.frame, bathtubProp.x, bathtubProp.y, 1)} />
      )}

      {/* Scmpoo companion — overlays sheep during poo_* animations */}
      {pooDisplay && (
        <div style={{
          ...scmpooStyle(pooDisplay.sheet, pooDisplay.frame, pooDisplay.x, pooDisplay.y, POO_SCALE),
          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
        }} />
      )}
    </div>
  );
}
