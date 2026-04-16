// Procedural sound effects via Web Audio — no asset shipping.
// All SFX are synthesised from oscillators + filtered noise so the app stays self-contained.

let ctx: AudioContext | null = null;
let muted = true;
let masterVolume = 0.5;

function ac(): AudioContext {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') {
    // Best-effort resume; fine if the browser still requires a gesture.
    void ctx.resume().catch(() => {});
  }
  return ctx;
}

export function setSoundEnabled(enabled: boolean) { muted = !enabled; }
export function setSoundVolume(v: number) { masterVolume = Math.max(0, Math.min(1, v)); }

interface ToneOpts {
  freq: number;
  freqEnd?: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
}

function tone(opts: ToneOpts) {
  if (muted) return;
  const a = ac();
  const t0 = a.currentTime + (opts.delay ?? 0);
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(opts.freq, t0);
  if (opts.freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.freqEnd), t0 + opts.duration);
  }
  const peak = (opts.gain ?? 0.3) * masterVolume;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.duration);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + opts.duration + 0.05);
}

function noiseBurst(duration: number, gain: number, filterFreq: number, delay = 0) {
  if (muted) return;
  const a = ac();
  const t0 = a.currentTime + delay;
  const frames = Math.max(1, Math.floor(a.sampleRate * duration));
  const buf = a.createBuffer(1, frames, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterFreq;
  const g = a.createGain();
  g.gain.setValueAtTime(gain * masterVolume, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  src.connect(filter).connect(g).connect(a.destination);
  src.start(t0);
  src.stop(t0 + duration + 0.05);
}

export const sfx = {
  baa: () => {
    tone({ freq: 230, freqEnd: 140, duration: 0.35, type: 'sawtooth', gain: 0.22 });
  },
  boing: () => {
    tone({ freq: 280, freqEnd: 720, duration: 0.12, type: 'sine', gain: 0.28 });
    tone({ freq: 720, freqEnd: 260, duration: 0.14, type: 'sine', gain: 0.22, delay: 0.10 });
  },
  sneeze: () => {
    noiseBurst(0.06, 0.18, 3000);
    tone({ freq: 900, freqEnd: 200, duration: 0.22, type: 'sawtooth', gain: 0.25, delay: 0.08 });
  },
  burnLand: () => {
    noiseBurst(0.45, 0.28, 1200);
    tone({ freq: 120, freqEnd: 40, duration: 0.5, type: 'triangle', gain: 0.2 });
  },
  pee: () => {
    noiseBurst(1.3, 0.07, 500);
  },
  ufoHum: () => {
    tone({ freq: 80, duration: 1.8, type: 'sine', gain: 0.18 });
    tone({ freq: 83, duration: 1.8, type: 'sine', gain: 0.15 });
  },
  cryptoUp: () => {
    tone({ freq: 523, duration: 0.1, type: 'sine', gain: 0.25 });                   // C5
    tone({ freq: 659, duration: 0.1, type: 'sine', gain: 0.25, delay: 0.10 });      // E5
    tone({ freq: 784, duration: 0.18, type: 'sine', gain: 0.25, delay: 0.20 });     // G5
  },
  cryptoDown: () => {
    tone({ freq: 659, duration: 0.1, type: 'sine', gain: 0.25 });                   // E5
    tone({ freq: 523, duration: 0.1, type: 'sine', gain: 0.25, delay: 0.10 });      // C5
    tone({ freq: 415, duration: 0.18, type: 'sine', gain: 0.25, delay: 0.20 });     // G#4
  },
  ding: () => {
    tone({ freq: 880, duration: 0.25, type: 'sine', gain: 0.22 });
  },
  splash: () => {
    noiseBurst(0.5, 0.25, 2500);
    tone({ freq: 600, freqEnd: 200, duration: 0.45, type: 'sine', gain: 0.18 });
  },
  thud: () => {
    noiseBurst(0.18, 0.32, 600);
    tone({ freq: 90, freqEnd: 40, duration: 0.22, type: 'triangle', gain: 0.25 });
  },
};

export type SfxName = keyof typeof sfx;
