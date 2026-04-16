import { useEffect, useState } from 'react';
import DesktopPet from './DesktopPet';
import SpeechBubble, { type BubbleRequest } from './SpeechBubble';
import { sfx, setSoundEnabled, setSoundVolume, type SfxName } from './sound-fx';

type SummonAction =
  | 'burn' | 'boing' | 'climb' | 'ufo' | 'alien' | 'blacksheep'
  | 'jump' | 'flower' | 'random' | 'sleep' | 'sit' | 'yawn' | 'roll' | 'pee'
  | 'blink' | 'yawnQuirk' | 'baa' | 'sneeze' | 'amazed' | 'blush'
  | 'spin' | 'rollMove' | 'lookDown' | 'turnAround' | 'jumpDown'
  | 'balloon' | 'disco' | 'mushroom';

interface SheepConsole {
  burn?: () => void; boing?: () => void; climb?: () => void;
  ufo?: () => void; alien?: () => void; blacksheep?: () => void;
  jump?: () => void; flower?: () => void; random?: () => void;
  sleep?: () => void; sit?: () => void; yawn?: () => void; roll?: () => void;
  pee?: () => void;
  blink?: () => void; yawnQuirk?: () => void; baa?: () => void;
  sneeze?: () => void; amazed?: () => void; blush?: () => void;
  spin?: () => void; rollMove?: () => void; lookDown?: () => void; turnAround?: () => void;
  jumpDown?: () => void;
  balloon?: () => void; disco?: () => void; mushroom?: () => void;
  forceSleep?: () => void;
}

interface PrefsShape {
  sheepSpeed?: number;
  sound?: { enabled?: boolean; volume?: number };
}

export interface WinRect { x: number; y: number; w: number; h: number }

export default function App() {
  const [visible, setVisible] = useState(true);
  const [sheepSpeed, setSheepSpeed] = useState(1);
  const [windowRect, setWindowRect] = useState<WinRect | null>(null);

  useEffect(() => {
    if (!window.smp) return;
    const unsubs = [
      window.smp.on('smp:set-visible', (v) => setVisible(Boolean(v))),
      window.smp.on('smp:summon', (action) => {
        const sheep = (window as unknown as { sheep?: SheepConsole }).sheep;
        const name = action as SummonAction;
        sheep?.[name]?.();
      }),
      window.smp.on('smp:idle-sleep', () => {
        const sheep = (window as unknown as { sheep?: SheepConsole }).sheep;
        sheep?.forceSleep?.();
      }),
      window.smp.on('smp:idle-wake', () => {
        // sheep wakes naturally
      }),
      window.smp.on('smp:say', (req) => {
        window.sheepSay?.say(req as BubbleRequest);
      }),
      window.smp.on('smp:prefs-changed', (p) => {
        const prefs = p as PrefsShape;
        if (typeof prefs.sheepSpeed === 'number' && Number.isFinite(prefs.sheepSpeed)) {
          setSheepSpeed(prefs.sheepSpeed);
        }
        if (prefs.sound) {
          if (typeof prefs.sound.enabled === 'boolean') setSoundEnabled(prefs.sound.enabled);
          if (typeof prefs.sound.volume === 'number') setSoundVolume(prefs.sound.volume);
        }
      }),
      window.smp.on('smp:play-sfx', (name) => {
        const n = name as SfxName;
        sfx[n]?.();
      }),
      window.smp.on('smp:window-rect', (rect) => {
        setWindowRect(rect as WinRect | null);
      }),
    ];
    return () => { unsubs.forEach((u) => u()); };
  }, []);

  return (
    <>
      <DesktopPet visible={visible} speedMultiplier={sheepSpeed} windowRect={windowRect} />
      <SpeechBubble />
    </>
  );
}
