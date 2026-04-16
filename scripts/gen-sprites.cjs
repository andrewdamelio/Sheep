// Hand-drawn pixel-art sprite sheets matching scmpoo OG style.
// 40x40 per frame, 16 frames per sheet (640x40). RGBA, transparent BG.
// Writes directly to src/assets/ — run via `node scripts/gen-sprites.cjs`.

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

// ── Minimal PNG encoder ──────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePng(w, h, pixels) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0;
    for (let x = 0; x < w; x++) {
      const src = (y * w + x) * 4;
      const dst = y * (1 + w * 4) + 1 + x * 4;
      raw[dst] = pixels[src];
      raw[dst + 1] = pixels[src + 1];
      raw[dst + 2] = pixels[src + 2];
      raw[dst + 3] = pixels[src + 3];
    }
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ── Canvas helpers ───────────────────────────────────────────────────────
class Canvas {
  constructor(w, h) { this.w = w; this.h = h; this.pixels = new Uint8Array(w * h * 4); }
  set(x, y, r, g, b, a = 255) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const o = (y * this.w + x) * 4;
    this.pixels[o] = r; this.pixels[o+1] = g; this.pixels[o+2] = b; this.pixels[o+3] = a;
  }
  rect(x, y, w, h, c) { for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) this.set(x+dx, y+dy, c[0], c[1], c[2], c[3] ?? 255); }
  disc(cx, cy, rad, c) {
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
      if (dx*dx + dy*dy <= rad*rad) this.set(cx+dx, cy+dy, c[0], c[1], c[2], c[3] ?? 255);
    }
  }
  ring(cx, cy, rad, c) {
    const inner = (rad - 1) * (rad - 1);
    const outer = rad * rad;
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
      const d = dx*dx + dy*dy;
      if (d <= outer && d >= inner) this.set(cx+dx, cy+dy, c[0], c[1], c[2], c[3] ?? 255);
    }
  }
  line(x1, y1, x2, y2, c) {
    const dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1, sy = y1 < y2 ? 1 : -1;
    let err = dx - dy, x = x1, y = y1;
    while (true) {
      this.set(x, y, c[0], c[1], c[2], c[3] ?? 255);
      if (x === x2 && y === y2) break;
      const e2 = err * 2;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 <  dx) { err += dx; y += sy; }
    }
  }
  // Copy a 40x40 frame canvas into a strip at column `col`.
  blitInto(strip, col) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const srcO = (y * this.w + x) * 4;
      const dstO = (y * strip.w + (col * this.w + x)) * 4;
      strip.pixels[dstO]   = this.pixels[srcO];
      strip.pixels[dstO+1] = this.pixels[srcO+1];
      strip.pixels[dstO+2] = this.pixels[srcO+2];
      strip.pixels[dstO+3] = this.pixels[srcO+3];
    }
  }
}

function newFrame() { return new Canvas(40, 40); }
function newStrip() { return new Canvas(640, 40); }

// ── Palette ──────────────────────────────────────────────────────────────
// Classic Screen Mate Poo palette: saturated primaries + dark outlines.
const BLACK    = [0x1a, 0x1a, 0x1a];
const OUTLINE  = [0x33, 0x33, 0x33];
const WHITE    = [0xff, 0xff, 0xff];
const CREAM    = [0xff, 0xec, 0xc4];

const BALLOON_RED      = [0xe8, 0x2a, 0x2a];
const BALLOON_RED_HI   = [0xff, 0x88, 0x88];
const BALLOON_BLUE     = [0x34, 0x6a, 0xe8];
const BALLOON_BLUE_HI  = [0x9a, 0xc0, 0xff];
const BALLOON_YELLOW   = [0xf0, 0xc0, 0x28];
const BALLOON_YELLOW_HI= [0xff, 0xf2, 0x98];
const BALLOON_PINK     = [0xff, 0x66, 0xaa];
const BALLOON_PINK_HI  = [0xff, 0xc0, 0xdc];
const STRING           = [0x60, 0x60, 0x60];

const DISCO_DARK   = [0x38, 0x40, 0x5c];
const DISCO_MID    = [0x6c, 0x78, 0x90];
const DISCO_LIGHT  = [0xc0, 0xd0, 0xe8];
const DISCO_FLASH  = [0xff, 0xff, 0xee];
const NOTE_DARK    = [0x2a, 0x2a, 0x3a];
const NOTE_BODY    = [0x44, 0x44, 0x66];

const CAP_RED      = [0xd6, 0x28, 0x28];
const CAP_RED_HI   = [0xff, 0x60, 0x5a];
const STEM_TAN     = [0xf3, 0xe3, 0xbd];
const STEM_SHADE   = [0xc8, 0xb2, 0x86];
const GRASS        = [0x4e, 0xa0, 0x3e];
const GRASS_HI     = [0x8a, 0xd8, 0x6e];
const SPARK        = [0xff, 0xfa, 0xcc];
const SPARK_PINK   = [0xff, 0x9f, 0xe6];
const SPARK_BLUE   = [0x8c, 0xdc, 0xff];

// ── Balloon sheet ────────────────────────────────────────────────────────
// 16 frames. 0-1=red bob, 2-3=blue, 4-5=yellow, 6-7=pink, 8=stretch, 9=burst,
// 10=rubber shred, 11=empty (cleanup), 12-15=spare.
function drawBalloonBody(c, bobX, body, hi) {
  // Balloon body: 13w × 16h pear shape, tie + string hanging down
  const cx = 20 + bobX;
  const top = 3;
  // Body outline ring first, then fill
  // Approximate pear: wider at top, narrows at bottom
  const shape = [
    '...###..###...',
    '..##########..',
    '.############.',
    '.############.',
    '.############.',
    '.############.',
    '.############.',
    '.############.',
    '..##########..',
    '..##########..',
    '...########...',
    '....######....',
    '.....####.....',
    '......##......',
  ];
  const w = shape[0].length;
  const h = shape.length;
  const startX = cx - Math.floor(w / 2);
  const startY = top;
  // Outline pass
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    if (shape[yy][xx] === '#') c.set(startX + xx, startY + yy, body[0], body[1], body[2]);
  }
  // Outline around the body for a crisp edge
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    if (shape[yy][xx] !== '#') continue;
    const neighbors = [
      yy > 0 && shape[yy-1][xx] === '#',
      yy < h-1 && shape[yy+1][xx] === '#',
      xx > 0 && shape[yy][xx-1] === '#',
      xx < w-1 && shape[yy][xx+1] === '#',
    ];
    if (neighbors.some(n => !n)) {
      c.set(startX + xx, startY + yy, OUTLINE[0], OUTLINE[1], OUTLINE[2]);
    }
  }
  // Highlight — crescent on upper-left
  c.set(startX + 3, startY + 2, hi[0], hi[1], hi[2]);
  c.set(startX + 4, startY + 2, hi[0], hi[1], hi[2]);
  c.set(startX + 2, startY + 3, hi[0], hi[1], hi[2]);
  c.set(startX + 3, startY + 3, hi[0], hi[1], hi[2]);
  c.set(startX + 2, startY + 4, hi[0], hi[1], hi[2]);
  c.set(startX + 3, startY + 5, hi[0], hi[1], hi[2]);
  // Knot triangle just below body
  c.set(startX + 6, startY + h, OUTLINE[0], OUTLINE[1], OUTLINE[2]);
  c.set(startX + 7, startY + h, OUTLINE[0], OUTLINE[1], OUTLINE[2]);
  c.set(startX + 7, startY + h + 1, OUTLINE[0], OUTLINE[1], OUTLINE[2]);
  // String — zigzag from tie down to bottom of frame (grip point)
  let sx = cx, sy = startY + h + 2;
  for (let i = 0; i < 18 && sy < 40; i++) {
    c.set(sx, sy, STRING[0], STRING[1], STRING[2]);
    sy++;
    if (i % 3 === 2) sx += (i % 6 < 3 ? 1 : -1);
  }
}

function makeBalloonSheet() {
  const strip = newStrip();
  const colors = [
    [BALLOON_RED, BALLOON_RED_HI],
    [BALLOON_BLUE, BALLOON_BLUE_HI],
    [BALLOON_YELLOW, BALLOON_YELLOW_HI],
    [BALLOON_PINK, BALLOON_PINK_HI],
  ];
  for (let i = 0; i < 8; i++) {
    const c = newFrame();
    const [body, hi] = colors[Math.floor(i / 2)];
    const bob = (i % 2 === 0) ? 0 : 1; // 1px bob
    drawBalloonBody(c, bob, body, hi);
    c.blitInto(strip, i);
  }
  // Frame 8 — stretch (pre-pop): slightly elongated red balloon
  {
    const c = newFrame();
    const cx = 20;
    const shape = [
      '...##..##...',
      '..########..',
      '..########..',
      '.##########.',
      '.##########.',
      '.##########.',
      '.##########.',
      '.##########.',
      '.##########.',
      '.##########.',
      '.##########.',
      '.##########.',
      '..########..',
      '...######...',
      '....####....',
      '.....##.....',
    ];
    const w = shape[0].length, h = shape.length;
    const sx = cx - Math.floor(w / 2), sy = 2;
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      if (shape[yy][xx] === '#') c.set(sx + xx, sy + yy, BALLOON_RED[0], BALLOON_RED[1], BALLOON_RED[2]);
    }
    // Outline
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      if (shape[yy][xx] !== '#') continue;
      const nbrs = [yy>0 && shape[yy-1][xx]==='#', yy<h-1 && shape[yy+1][xx]==='#', xx>0 && shape[yy][xx-1]==='#', xx<w-1 && shape[yy][xx+1]==='#'];
      if (nbrs.some(n => !n)) c.set(sx + xx, sy + yy, OUTLINE[0], OUTLINE[1], OUTLINE[2]);
    }
    // Stress highlight
    c.rect(sx + 2, sy + 2, 2, 1, BALLOON_RED_HI);
    c.rect(sx + 2, sy + 3, 1, 2, BALLOON_RED_HI);
    // String dangling (compressed)
    for (let i = 0; i < 16 && sy + h + 1 + i < 40; i++) c.set(cx, sy + h + 1 + i, STRING[0], STRING[1], STRING[2]);
    c.blitInto(strip, 8);
  }
  // Frame 9 — burst explosion (asterisk of rubber bits)
  {
    const c = newFrame();
    const cx = 20, cy = 12;
    const bits = [
      [-6, -4], [-4, -6], [0, -7], [4, -6], [6, -4],
      [-7, 0], [7, 0],
      [-6, 3], [-3, 5], [0, 6], [3, 5], [6, 3],
      [-2, -2], [2, -2], [-2, 2], [2, 2],
    ];
    for (const [dx, dy] of bits) {
      c.rect(cx + dx, cy + dy, 2, 2, BALLOON_RED);
    }
    // Flash in center
    c.disc(cx, cy, 3, BALLOON_RED_HI);
    c.set(cx, cy, WHITE[0], WHITE[1], WHITE[2]);
    // Short string remnant
    for (let i = 0; i < 10; i++) c.set(cx, 22 + i, STRING[0], STRING[1], STRING[2]);
    c.blitInto(strip, 9);
  }
  // Frame 10 — rubber shreds falling
  {
    const c = newFrame();
    const shreds = [
      [10, 14, 3, 1], [14, 18, 2, 2], [20, 16, 4, 1],
      [26, 20, 2, 2], [12, 22, 3, 1], [24, 25, 2, 1],
      [16, 28, 3, 2], [28, 30, 2, 1],
    ];
    for (const [x, y, w, h] of shreds) c.rect(x, y, w, h, BALLOON_RED);
    for (const [x, y] of shreds) c.set(x, y, OUTLINE[0], OUTLINE[1], OUTLINE[2]);
    c.blitInto(strip, 10);
  }
  // Frame 11 — empty
  { const c = newFrame(); c.blitInto(strip, 11); }
  // Frames 12-15 — recolored bobs for variety (green, purple, orange, cyan)
  const extras = [
    [[0x3c, 0xc8, 0x4a], [0xa0, 0xff, 0xa6]],
    [[0x8a, 0x42, 0xc8], [0xd0, 0xa0, 0xff]],
    [[0xff, 0x8c, 0x2a], [0xff, 0xc8, 0x7a]],
    [[0x2a, 0xc8, 0xd6], [0x9a, 0xec, 0xf6]],
  ];
  for (let i = 0; i < 4; i++) {
    const c = newFrame();
    drawBalloonBody(c, i % 2, extras[i][0], extras[i][1]);
    c.blitInto(strip, 12 + i);
  }
  return strip;
}

// ── Disco ball sheet ─────────────────────────────────────────────────────
// 16 frames. 0-5=ball spin (6 rotation phases). 6-11=music notes (4 kinds × variants).
// 12-15=spare.
function drawDiscoBall(c, phase) {
  const cx = 20;
  const ballCy = 20;
  const r = 9;
  // String from top of frame to ball top
  for (let y = 0; y < ballCy - r; y++) c.set(cx, y, STRING[0], STRING[1], STRING[2]);
  // Mount at top
  c.set(cx - 1, 0, OUTLINE[0], OUTLINE[1], OUTLINE[2]);
  c.set(cx,     0, OUTLINE[0], OUTLINE[1], OUTLINE[2]);
  c.set(cx + 1, 0, OUTLINE[0], OUTLINE[1], OUTLINE[2]);
  // Ball base disc (mid tone) and outline
  c.disc(cx, ballCy, r, DISCO_MID);
  c.ring(cx, ballCy, r, OUTLINE);
  // Facet grid — diamond pattern that shifts with phase
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx*dx + dy*dy > (r-1) * (r-1)) continue;
      const gx = dx + r;
      const gy = dy + r;
      const shift = (phase % 6);
      const cell = ((gx + shift) + gy) % 3;
      const band = Math.floor((gx + gy + shift) / 2) % 4;
      let color;
      if (cell === 0) color = DISCO_DARK;
      else if (cell === 1 && band === 0) color = DISCO_FLASH;
      else if (cell === 1) color = DISCO_LIGHT;
      else color = DISCO_MID;
      c.set(cx + dx, ballCy + dy, color[0], color[1], color[2]);
    }
  }
  // Subtle highlight that travels around the ball with phase
  const hiAngle = (phase / 6) * Math.PI * 2;
  const hx = cx + Math.round(Math.cos(hiAngle) * (r - 3));
  const hy = ballCy + Math.round(Math.sin(hiAngle) * (r - 3));
  c.rect(hx, hy, 2, 2, DISCO_FLASH);
}

function drawMusicNote(c, kind) {
  // Simple ♪ / ♫ / ♩ variants rendered in a 12×16 area, centered.
  const cx = 20, cy = 22;
  const paint = (ox, oy, color) => c.set(cx + ox, cy + oy, color[0], color[1], color[2]);
  if (kind === 0) {
    // Eighth note ♪: stem + oval head + flag
    // Head (oval, 5w × 3h)
    paint(-3, 4, NOTE_BODY); paint(-2, 4, NOTE_BODY); paint(-1, 4, NOTE_BODY); paint(0, 4, NOTE_BODY);
    paint(-4, 5, NOTE_BODY); paint(-3, 5, NOTE_BODY); paint(-2, 5, NOTE_BODY); paint(-1, 5, NOTE_BODY); paint(0, 5, NOTE_BODY);
    paint(-3, 6, NOTE_BODY); paint(-2, 6, NOTE_BODY); paint(-1, 6, NOTE_BODY); paint(0, 6, NOTE_BODY);
    // Stem
    for (let y = -10; y <= 4; y++) paint(0, y, NOTE_BODY);
    // Flag
    paint(1, -10, NOTE_BODY); paint(2, -9, NOTE_BODY); paint(2, -8, NOTE_BODY); paint(1, -7, NOTE_BODY);
    paint(2, -7, NOTE_BODY); paint(3, -6, NOTE_BODY); paint(2, -5, NOTE_BODY);
    // Outline pass (dark edge)
    paint(-4, 4, NOTE_DARK); paint(1, 4, NOTE_DARK);
    paint(-5, 5, NOTE_DARK); paint(1, 5, NOTE_DARK);
    paint(-4, 6, NOTE_DARK); paint(1, 6, NOTE_DARK);
    paint(-3, 7, NOTE_DARK); paint(-2, 7, NOTE_DARK); paint(-1, 7, NOTE_DARK); paint(0, 7, NOTE_DARK);
    paint(-3, 3, NOTE_DARK); paint(-2, 3, NOTE_DARK); paint(-1, 3, NOTE_DARK);
  } else if (kind === 1) {
    // Double eighth ♫: two heads, beamed at top
    for (const xoff of [-4, 2]) {
      // Head
      for (let hy = 4; hy <= 6; hy++) for (let hx = 0; hx <= 3; hx++) paint(xoff + hx, hy, NOTE_BODY);
      // Stem
      for (let y = -10; y <= 4; y++) paint(xoff + 3, y, NOTE_BODY);
    }
    // Beam connecting stems
    for (let x = -1; x <= 5; x++) { paint(x, -10, NOTE_BODY); paint(x, -9, NOTE_BODY); }
  } else if (kind === 2) {
    // Quarter note ♩: filled head + stem, no flag
    for (let hy = 4; hy <= 6; hy++) for (let hx = -3; hx <= 1; hx++) paint(hx, hy, NOTE_BODY);
    for (let y = -9; y <= 4; y++) paint(1, y, NOTE_BODY);
    paint(-4, 4, NOTE_DARK); paint(2, 4, NOTE_DARK);
    paint(-4, 5, NOTE_DARK); paint(2, 5, NOTE_DARK);
    paint(-4, 6, NOTE_DARK); paint(2, 6, NOTE_DARK);
  } else {
    // Sixteenth ♬: two heads with double beam
    for (const xoff of [-4, 2]) {
      for (let hy = 4; hy <= 6; hy++) for (let hx = 0; hx <= 3; hx++) paint(xoff + hx, hy, NOTE_BODY);
      for (let y = -10; y <= 4; y++) paint(xoff + 3, y, NOTE_BODY);
    }
    for (let x = -1; x <= 5; x++) {
      paint(x, -10, NOTE_BODY); paint(x, -9, NOTE_BODY);
      paint(x, -7, NOTE_BODY); paint(x, -6, NOTE_BODY);
    }
  }
}

function makeDiscoSheet() {
  const strip = newStrip();
  for (let i = 0; i < 6; i++) {
    const c = newFrame();
    drawDiscoBall(c, i);
    c.blitInto(strip, i);
  }
  // Frames 6-9: music note variants (same kind, tinted later via CSS)
  for (let i = 0; i < 4; i++) {
    const c = newFrame();
    drawMusicNote(c, i);
    c.blitInto(strip, 6 + i);
  }
  // Frames 10-11: big sparkle bursts (for ambient)
  for (let i = 0; i < 2; i++) {
    const c = newFrame();
    const cx = 20, cy = 20;
    const rad = 4 + i;
    const color = i === 0 ? DISCO_FLASH : [0xff, 0xea, 0x66];
    // Cross sparkle
    for (let k = -rad; k <= rad; k++) {
      c.set(cx + k, cy, color[0], color[1], color[2]);
      c.set(cx, cy + k, color[0], color[1], color[2]);
    }
    for (let k = -rad + 2; k <= rad - 2; k++) {
      c.set(cx + k, cy + k, color[0], color[1], color[2]);
      c.set(cx + k, cy - k, color[0], color[1], color[2]);
    }
    c.blitInto(strip, 10 + i);
  }
  // Frames 12-15: empty
  return strip;
}

// ── Mushroom sheet ───────────────────────────────────────────────────────
// Chunky spotted mushroom — fills most of the 40x40 cell.
// 0-3: grow. 4-6: eaten. 7: gone. 8-11: sparkles (4 kinds). 12-15: spare.
function drawMushroom(c, stage) {
  const cx = 20, baseY = 38; // ground line
  if (stage === 0) {
    // Sprout: just stem poking up, tiny cap dot
    c.rect(cx - 1, baseY - 6, 2, 6, STEM_TAN);
    c.set(cx - 2, baseY - 6, STEM_SHADE[0], STEM_SHADE[1], STEM_SHADE[2]);
    c.set(cx + 1, baseY - 6, STEM_SHADE[0], STEM_SHADE[1], STEM_SHADE[2]);
    c.rect(cx - 1, baseY - 8, 3, 2, CAP_RED);
    c.set(cx - 1, baseY - 8, WHITE[0], WHITE[1], WHITE[2]);
    c.set(cx - 4, baseY, GRASS[0], GRASS[1], GRASS[2]);
    c.set(cx + 4, baseY, GRASS[0], GRASS[1], GRASS[2]);
  } else if (stage === 1) {
    // Small — cap half-grown
    drawMushroomStem(c, cx, baseY, 4, 12);
    drawMushroomCap(c, cx, baseY - 12, 8, 5, 3);
  } else if (stage === 2) {
    // Medium
    drawMushroomStem(c, cx, baseY, 6, 18);
    drawMushroomCap(c, cx, baseY - 18, 12, 8, 4);
  } else if (stage === 3) {
    // Full size — tall stem, chunky cap
    drawMushroomStem(c, cx, baseY, 9, 23);
    drawMushroomCap(c, cx, baseY - 23, 16, 11, 5);
  } else if (stage === 4) {
    // Bitten once — big rounded scoop from the right side of cap
    drawMushroomStem(c, cx, baseY, 9, 23);
    drawMushroomCap(c, cx, baseY - 23, 16, 11, 5);
    scoopOutBite(c, cx + 11, baseY - 24, 7);
    // A couple of crumbs below the bite mark
    c.set(cx + 12, baseY - 4, CAP_RED[0], CAP_RED[1], CAP_RED[2]);
    c.set(cx + 14, baseY - 2, CAP_RED[0], CAP_RED[1], CAP_RED[2]);
    c.set(cx + 10, baseY - 1, CAP_RED[0], CAP_RED[1], CAP_RED[2]);
  } else if (stage === 5) {
    // Bitten twice — scoops from both sides, cap noticeably smaller on top
    drawMushroomStem(c, cx, baseY, 9, 23);
    drawMushroomCap(c, cx, baseY - 23, 16, 11, 5);
    scoopOutBite(c, cx + 11, baseY - 24, 8);
    scoopOutBite(c, cx - 11, baseY - 24, 8);
    // Take a nibble off the top too
    scoopOutBite(c, cx, baseY - 35, 5);
    // Crumbs scattered both sides
    c.set(cx + 13, baseY - 3, CAP_RED[0], CAP_RED[1], CAP_RED[2]);
    c.set(cx - 13, baseY - 3, CAP_RED[0], CAP_RED[1], CAP_RED[2]);
    c.set(cx + 11, baseY - 1, CAP_RED[0], CAP_RED[1], CAP_RED[2]);
    c.set(cx - 10, baseY - 1, CAP_RED[0], CAP_RED[1], CAP_RED[2]);
  } else if (stage === 6) {
    // Mostly gone — stem with a chewed-flat top; a few cap crumbs on the ground
    drawMushroomStem(c, cx, baseY, 9, 23);
    // "Chewed" uneven top on the stem
    for (let dx = -4; dx <= 4; dx++) {
      const jitter = ((dx * 7) & 1) ? 0 : 1;
      c.set(cx + dx, baseY - 23 - jitter, OUTLINE[0], OUTLINE[1], OUTLINE[2]);
    }
    // Crumbs scattered on the ground
    const crumbs = [[-10, -2], [-6, -1], [-2, 0], [4, -1], [9, 0], [12, -2], [-12, 0]];
    for (const [dx, dy] of crumbs) {
      c.set(cx + dx, baseY + dy, CAP_RED[0], CAP_RED[1], CAP_RED[2]);
    }
    // A stray white spot fragment
    c.set(cx - 3, baseY - 3, WHITE[0], WHITE[1], WHITE[2]);
    c.set(cx + 5, baseY - 2, WHITE[0], WHITE[1], WHITE[2]);
  } else if (stage === 7) {
    // Gone — a few sparkles where the mushroom was
    c.set(cx - 6, baseY - 14, SPARK[0], SPARK[1], SPARK[2]);
    c.set(cx + 6, baseY - 14, SPARK[0], SPARK[1], SPARK[2]);
    c.set(cx,     baseY - 20, SPARK[0], SPARK[1], SPARK[2]);
    c.set(cx - 3, baseY - 8,  SPARK[0], SPARK[1], SPARK[2]);
    c.set(cx + 4, baseY - 5,  SPARK[0], SPARK[1], SPARK[2]);
  }
  // Ground accent beneath (grass tufts) for stages 1-6
  if (stage >= 1 && stage <= 6) {
    c.set(cx - 11, baseY, GRASS[0], GRASS[1], GRASS[2]);
    c.set(cx - 10, baseY - 1, GRASS_HI[0], GRASS_HI[1], GRASS_HI[2]);
    c.set(cx + 11, baseY, GRASS[0], GRASS[1], GRASS[2]);
    c.set(cx + 10, baseY - 1, GRASS_HI[0], GRASS_HI[1], GRASS_HI[2]);
  }
}

// Round bite scoop — clears pixels within a circle and draws a jagged teeth edge
function scoopOutBite(c, cx, cy, radius) {
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx*dx + dy*dy <= r2) c.set(cx + dx, cy + dy, 0, 0, 0, 0);
    }
  }
  // Jagged teeth-like outline along the scoop edge — add outline dots just outside the circle
  const edgePoints = [];
  for (let deg = 0; deg < 360; deg += 14) {
    const a = deg * Math.PI / 180;
    const rr = radius + (deg % 28 === 0 ? 0 : -1);
    const px = Math.round(cx + Math.cos(a) * rr);
    const py = Math.round(cy + Math.sin(a) * rr);
    edgePoints.push([px, py]);
  }
  for (const [px, py] of edgePoints) {
    c.set(px, py, OUTLINE[0], OUTLINE[1], OUTLINE[2]);
  }
}

function drawMushroomStem(c, cx, baseY, w, h) {
  // Main stem — cream with a shaded right side
  for (let y = 0; y < h; y++) {
    for (let x = -Math.floor(w/2); x <= Math.floor(w/2); x++) {
      c.set(cx + x, baseY - y, STEM_TAN[0], STEM_TAN[1], STEM_TAN[2]);
    }
    // Shade right edge
    c.set(cx + Math.floor(w/2), baseY - y, STEM_SHADE[0], STEM_SHADE[1], STEM_SHADE[2]);
  }
  // Outline sides
  for (let y = 0; y < h; y++) {
    c.set(cx - Math.floor(w/2) - 1, baseY - y, OUTLINE[0], OUTLINE[1], OUTLINE[2]);
    c.set(cx + Math.floor(w/2) + 1, baseY - y, OUTLINE[0], OUTLINE[1], OUTLINE[2]);
  }
}

function drawMushroomCap(c, cx, capY, w, hTop, hBot) {
  // Dome top (semicircle-ish), flat-ish bottom
  for (let dy = -hTop; dy <= hBot; dy++) {
    for (let dx = -w; dx <= w; dx++) {
      const inside = dy < 0
        ? dx*dx / (w*w) + dy*dy / (hTop*hTop) <= 1
        : Math.abs(dx) <= w - (dy >= hBot ? 1 : 0);
      if (inside) c.set(cx + dx, capY + dy, CAP_RED[0], CAP_RED[1], CAP_RED[2]);
    }
  }
  // Cap outline
  for (let dy = -hTop; dy <= hBot; dy++) {
    for (let dx = -w; dx <= w; dx++) {
      const inside = dy < 0
        ? dx*dx / (w*w) + dy*dy / (hTop*hTop) <= 1
        : Math.abs(dx) <= w - (dy >= hBot ? 1 : 0);
      if (!inside) continue;
      const neighbors = [
        dy > -hTop && isInsideCap(dx, dy-1, w, hTop, hBot),
        dy < hBot  && isInsideCap(dx, dy+1, w, hTop, hBot),
        dx > -w    && isInsideCap(dx-1, dy, w, hTop, hBot),
        dx < w     && isInsideCap(dx+1, dy, w, hTop, hBot),
      ];
      if (neighbors.some(n => !n)) c.set(cx + dx, capY + dy, OUTLINE[0], OUTLINE[1], OUTLINE[2]);
    }
  }
  // White spots — positions scale with cap size
  const spots = w >= 7
    ? [[-4, -2], [3, -2], [0, -hTop + 1], [-2, 1], [5, 0]]
    : w >= 5
    ? [[-2, -1], [2, -1], [0, -hTop + 1]]
    : [[-1, 0], [1, -1]];
  for (const [sx, sy] of spots) {
    c.rect(cx + sx - 1, capY + sy - 1, 2, 2, WHITE);
  }
  // Highlight on upper-left of cap
  c.set(cx - w + 2, capY - hTop + 1, CAP_RED_HI[0], CAP_RED_HI[1], CAP_RED_HI[2]);
  c.set(cx - w + 3, capY - hTop + 1, CAP_RED_HI[0], CAP_RED_HI[1], CAP_RED_HI[2]);
}
function isInsideCap(dx, dy, w, hTop, hBot) {
  if (dy < 0) return dx*dx / (w*w) + dy*dy / (hTop*hTop) <= 1;
  return Math.abs(dx) <= w - (dy >= hBot ? 1 : 0);
}

function makeMushroomSheet() {
  const strip = newStrip();
  for (let i = 0; i < 8; i++) {
    const c = newFrame();
    drawMushroom(c, i);
    c.blitInto(strip, i);
  }
  // Frames 8-11: post-trip sparkles (4 floating glimmers) — for trippy walk overlay
  const sparkColors = [SPARK, SPARK_PINK, SPARK_BLUE, [0xff, 0xc0, 0x40]];
  for (let i = 0; i < 4; i++) {
    const c = newFrame();
    const color = sparkColors[i];
    const cx = 20, cy = 20;
    const rad = 3;
    // 4-point star
    for (let k = -rad; k <= rad; k++) {
      c.set(cx + k, cy, color[0], color[1], color[2]);
      c.set(cx, cy + k, color[0], color[1], color[2]);
    }
    c.set(cx - 1, cy - 1, color[0], color[1], color[2]);
    c.set(cx + 1, cy - 1, color[0], color[1], color[2]);
    c.set(cx - 1, cy + 1, color[0], color[1], color[2]);
    c.set(cx + 1, cy + 1, color[0], color[1], color[2]);
    c.blitInto(strip, 8 + i);
  }
  return strip;
}

// ── Write files ──────────────────────────────────────────────────────────
const outDir = path.join(__dirname, '..', 'src', 'assets');

function write(name, strip) {
  const buf = encodePng(strip.w, strip.h, strip.pixels);
  const full = path.join(outDir, name);
  fs.writeFileSync(full, buf);
  console.log(`wrote ${full} (${buf.length} bytes, ${strip.w}x${strip.h})`);
}

write('scmpoo_balloon.png',  makeBalloonSheet());
write('scmpoo_disco.png',    makeDiscoSheet());
write('scmpoo_mushroom.png', makeMushroomSheet());
