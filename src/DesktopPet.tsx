// DesktopPet — eSheep64 with full special events
// Sprite: Adrianotiger/desktopPet (esheep64), bundled locally
// Special events inspired by lwu309/Scmpoo + eSheep64 XML animations

import { useEffect, useRef, useState, useCallback } from 'react';
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
      if (r < 0.18) return 'walk';
      if (r < 0.30) return 'run_begin';
      if (r < 0.40) return 'graze';
      if (r < 0.50) return 'sleep1a';
      if (r < 0.58) return 'sleep2a';
      if (r < 0.64) return 'sit';
      if (r < 0.72) return 'poo_sit';
      if (r < 0.80) return 'poo_yawn';
      if (r < 0.88) return 'poo_sleep';
      if (r < 0.94) return 'poo_roll';
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

interface DesktopPetProps { visible: boolean; }

export default function DesktopPet({ visible }: DesktopPetProps) {
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
  const [bathtubProp, setBathtubProp] = useState<{ x: number; y: number; frame: number } | null>(null);
  const bathtubPropRef = useRef<{ x: number; y: number; frame: number; startTs: number; splash?: boolean } | null>(null);
  const [secondSheepDisplay, setSecondSheepDisplay] = useState<SecondSheep | null>(null);
  const [alienDisplay, setAlienDisplay] = useState<AlienDisplay | null>(null);
  const [ufoDisplay, setUfoDisplay] = useState<UfoDisplay | null>(null);
  const [flipY, setFlipY] = useState(false); // used during top_walk

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
  }, []);

  const triggerBoing = useCallback(() => {
    stateRef.current = 'boing';
    velRef.current.x = 0;
    frameIdxRef.current = 0;
    loopCycleRef.current = 0;
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
        setBathtubProp({ x: btProp.x, y: btProp.y, frame: newFrame });
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

    // ── Gravity ───────────────────────────────────────────────────────────
    if (stateRef.current === 'fall') {
      vel.y = Math.min(vel.y + 0.4, 10);
    } else if (stateRef.current === 'burn') {
      vel.y = Math.min(vel.y + 0.18, 5); // slower arc for burn — more hang time
    }

    // ── Apply velocity ────────────────────────────────────────────────────
    pos.x += vel.x;
    pos.y += vel.y;

    // ── Floor collision ───────────────────────────────────────────────────
    const isClimbing = ['climb_up', 'top_walk', 'climb_down', 'climb_prep', 'ufo_caught'].includes(stateRef.current);
    if (!isClimbing && pos.y >= H - RENDER_H) {
      pos.y = H - RENDER_H;
      vel.y = 0;
      if (stateRef.current === 'fall' || stateRef.current === 'drag') {
        vel.x = 0;
        stateRef.current = 'idle';
        frameIdxRef.current = 0;
        loopCycleRef.current = 0;
      } else if (stateRef.current === 'burn') {
        // Sheep lands — spawn the bathtub prop to douse the fire
        vel.x = 0;
        stateRef.current = 'idle';
        frameIdxRef.current = 0;
        loopCycleRef.current = 0;
        const btX = Math.max(0, Math.min(W - S_FW - 4, pos.x - S_FW / 4));
        const btY = H - S_FH;
        bathtubPropRef.current = { x: btX, y: btY, frame: 3, startTs: ts, splash: true };
        setBathtubProp({ x: btX, y: btY, frame: 3 });
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
          const flip = !['graze', 'seek', 'blacksheep', 'boing', 'climb_up', 'top_walk', 'climb_down'].includes(next) && Math.random() < 0.35;
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

  useEffect(() => {
    if (!visible) return;
    const onJump = () => {
      if (dragRef.current) return;
      velRef.current.y = -5;
      if (!['climb_up', 'top_walk', 'climb_down', 'ufo_caught', 'bathtub'].includes(stateRef.current)) {
        stateRef.current = 'fall';
        frameIdxRef.current = 0;
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
      flower:     () => {
        const x = RENDER_W + Math.random() * (window.innerWidth - RENDER_W * 3);
        const y = window.innerHeight - RENDER_H;
        const f = { x, y, frame: 5 };
        flowerRef.current = f;
        setFlower(f);
      },
      jump:       () => window.dispatchEvent(new CustomEvent('sheep-jump')),
      random:     triggerSpecialEvent,
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
    console.log('  sheep.random()     — random special event');
    return () => { delete (window as any).sheep; };
  }, [visible, triggerBurn, triggerBoing, triggerClimb, triggerBlacksheep, triggerUFO, triggerAlienEncounter, triggerPooState, triggerSpecialEvent]);

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
        style={sheepStyle(
          displayFrame, displayDir, displayPos.x, displayPos.y,
          {
            cursor: 'grab',
            pointerEvents: 'auto',
            visibility: pooDisplay ? 'hidden' : 'visible',
            filter: stateRef.current === 'burn'
              ? 'drop-shadow(0 0 8px #ff6600) drop-shadow(0 0 16px #ff2200) brightness(1.2)'
              : 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))',
            transform: [
              displayDir === 1 ? 'scaleX(-1)' : '',
              extraTransform,
            ].filter(Boolean).join(' ') || 'none',
          },
        )}
      />

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
