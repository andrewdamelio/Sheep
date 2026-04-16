import type { Prefs } from './prefs-store';

const API_URL = 'https://api.anthropic.com/v1/messages';
const COOLDOWN_MS = 5 * 60_000; // 5 min between AI calls
const HOURLY_CAP = 8; // max AI quips/hour

const SYSTEM_PROMPT = `You are the voice of a small pixel-art sheep who lives on the user's desktop — a modern revival of the 1994 "Screen Mate Poo" character.

Voice: warm, mischievous, cryptic. Deadpan more than zany. Occasionally drops a "baa" when it fits — never forced.

Rules:
- One short sentence. Under 18 words. Never two sentences.
- No emojis (the app adds those separately).
- No preamble, no quoting, no meta. Just the line.
- React to what the user is doing, don't narrate it back at them.`;

interface QuipContext {
  trigger: 'active-app' | 'crypto-move' | 'idle' | 'manual' | 'ambient';
  summary: string;
}

export interface AiQuipperOptions {
  getPrefs: () => Prefs;
}

export interface AiQuipper {
  quip(ctx: QuipContext): Promise<string | null>;
  quipRaw(ctx: QuipContext): Promise<{ ok: true; text: string } | { ok: false; error: string }>;
}

export function createAiQuipper(opts: AiQuipperOptions): AiQuipper {
  let lastCallAt = 0;
  let hourlyWindowStart = Date.now();
  let hourlyCount = 0;

  function rateLimited(): boolean {
    const now = Date.now();
    if (now - hourlyWindowStart >= 3600_000) {
      hourlyWindowStart = now;
      hourlyCount = 0;
    }
    if (hourlyCount >= HOURLY_CAP) return true;
    if (now - lastCallAt < COOLDOWN_MS) return true;
    return false;
  }

  async function quip(ctx: QuipContext): Promise<string | null> {
    const prefs = opts.getPrefs();
    if (!prefs.ai.enabled) return null;
    if (!prefs.ai.apiKey) return null;
    if (rateLimited()) return null;

    lastCallAt = Date.now();
    hourlyCount += 1;

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': prefs.ai.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: prefs.ai.model || 'claude-haiku-4-5-20251001',
          max_tokens: 60,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: `Context (${ctx.trigger}): ${ctx.summary}` }],
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.warn('[ai-quipper] HTTP', res.status, body.slice(0, 200));
        return null;
      }
      const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
      const text = json.content?.find((c) => c.type === 'text')?.text?.trim();
      if (!text) return null;
      // Strip wrapping quotes if the model added any
      return text.replace(/^["'“”]+|["'“”]+$/g, '').trim();
    } catch (err) {
      console.warn('[ai-quipper] call failed:', err);
      return null;
    }
  }

  async function quipRaw(ctx: QuipContext): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
    const prefs = opts.getPrefs();
    if (!prefs.ai.apiKey) return { ok: false, error: 'No API key set.' };
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': prefs.ai.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: prefs.ai.model || 'claude-haiku-4-5-20251001',
          max_tokens: 60,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: `Context (${ctx.trigger}): ${ctx.summary}` }],
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 180)}` };
      }
      const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
      const text = json.content?.find((c) => c.type === 'text')?.text?.trim();
      if (!text) return { ok: false, error: 'Empty response from API.' };
      return { ok: true, text: text.replace(/^["'“”]+|["'“”]+$/g, '').trim() };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return { quip, quipRaw };
}
