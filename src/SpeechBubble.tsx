import { useEffect, useRef, useState } from 'react';

export interface BubbleRequest {
  text: string;
  emoji?: string;
  tint?: 'green' | 'red' | 'neutral';
  durationMs?: number;
}

interface ActiveBubble extends BubbleRequest {
  id: number;
}

const DEFAULT_DURATION_MS = 6000;
let nextId = 1;

export interface SheepSayApi {
  say: (req: BubbleRequest) => void;
}

declare global {
  interface Window { sheepSay?: SheepSayApi }
}

interface SheepBoundsProvider { getBounds?: () => { x: number; y: number; w: number; h: number } }

export default function SpeechBubble() {
  const [bubble, setBubble] = useState<ActiveBubble | null>(null);
  const [sheepPos, setSheepPos] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const queueRef = useRef<BubbleRequest[]>([]);
  const showingRef = useRef(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pump = () => {
    const next = queueRef.current.shift();
    if (!next) { showingRef.current = false; return; }
    showingRef.current = true;
    const id = nextId++;
    setBubble({ ...next, id });
    const ms = next.durationMs ?? DEFAULT_DURATION_MS;
    dismissTimerRef.current = setTimeout(() => {
      setBubble(null);
      setTimeout(pump, 150);
    }, ms);
  };

  useEffect(() => {
    const api: SheepSayApi = {
      say: (req) => {
        queueRef.current.push(req);
        if (!showingRef.current) pump();
      },
    };
    window.sheepSay = api;
    return () => {
      delete window.sheepSay;
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      const s = (window as unknown as { sheep?: SheepBoundsProvider }).sheep;
      const b = s?.getBounds?.();
      if (b) setSheepPos(b);
    }, 50);
    return () => clearInterval(t);
  }, []);

  if (!bubble || !sheepPos) return null;

  const tint = bubble.tint ?? 'neutral';
  const bg = tint === 'green' ? '#0a3a0a' : tint === 'red' ? '#3a0a0a' : '#1a1a1a';
  const border = tint === 'green' ? '#8cff8c' : tint === 'red' ? '#ff8c8c' : '#ffffff';
  const text = tint === 'green' ? '#d8ffd8' : tint === 'red' ? '#ffd8d8' : '#ffffff';

  const midX = sheepPos.x + sheepPos.w / 2;
  const bubbleMaxW = 220;
  const bubbleLeft = Math.max(8, Math.min(window.innerWidth - bubbleMaxW - 8, midX - bubbleMaxW / 2));
  const bubbleTopAnchor = sheepPos.y - 6;

  return (
    <div
      style={{
        position: 'fixed',
        left: bubbleLeft,
        top: bubbleTopAnchor,
        transform: 'translateY(-100%)',
        maxWidth: bubbleMaxW,
        pointerEvents: 'none',
        zIndex: 16000,
        fontFamily: '"Chicago", ui-monospace, monospace',
      }}
    >
      <div
        style={{
          background: bg,
          color: text,
          border: `2px solid ${border}`,
          borderRadius: 4,
          padding: '6px 10px',
          fontSize: 12,
          lineHeight: 1.3,
          boxShadow: '3px 3px 0 rgba(0,0,0,0.5)',
          imageRendering: 'pixelated',
          display: 'flex',
          gap: 6,
          alignItems: 'center',
        }}
      >
        {bubble.emoji && <span style={{ fontSize: 14 }}>{bubble.emoji}</span>}
        <span>{bubble.text}</span>
      </div>
      <div
        style={{
          width: 0, height: 0,
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          borderTop: `8px solid ${border}`,
          marginLeft: Math.max(8, Math.min(bubbleMaxW - 20, midX - bubbleLeft - 6)),
          marginTop: -1,
        }}
      />
    </div>
  );
}
