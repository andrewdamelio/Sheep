export {};

declare global {
  interface Window {
    smp?: {
      reportSheepBounds: (bounds: { x: number; y: number; w: number; h: number }) => void;
      forceCapture: (force: boolean) => void;
      openPrefs?: () => void;
      showSheepMenu?: () => void;
      on: (channel: string, handler: (...args: unknown[]) => void) => () => void;
    };
  }
}
