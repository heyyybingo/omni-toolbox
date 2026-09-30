declare module 'gifenc' {
  export function GIFEncoder(): {
    writeFrame: (index: Uint8Array, width: number, height: number, opts?: { palette?: unknown; delay?: number }) => void;
    finish: () => Uint8Array;
  };
  export function quantize(rgba: Uint8Array, maxColors: number, options?: unknown): unknown;
  export function applyPalette(rgba: Uint8Array, palette: unknown, format?: string): Uint8Array;
}
