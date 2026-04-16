# Screen Mate Poo (macOS)

A modern macOS remake of the classic **Screen Mate Poo** / **eSheep** — a mischievous sheep that lives on top of every app on your desktop.

## Inspired by
- [lwu309/Scmpoo](https://github.com/lwu309/Scmpoo) — original Screen Mate Poo
- [Adrianotiger/desktopPet](https://adrianotiger.github.io/desktopPet/Pets/esheep64/) — eSheep64 sprite sheet + XML animations

## 2026 touches
- Menu bar tray control (no Dock icon)
- Transparent click-through overlay — sheep lives above every app, across all workspaces, even fullscreen
- Optional AI personality (bring your own Anthropic API key)
- Idle detection → sheep falls asleep
- Active-app awareness → sheep reacts to what you're using
- BTC/ETH big-move alerts via speech bubbles

## Dev

```bash
npm install
npm run electron:dev
```

## Package

```bash
npm run dist
```

Produces an unsigned `.app` in `release/`. On first launch, right-click → Open to bypass Gatekeeper.
