/** Shared watermark style — same for image and PDF. */
export type WatermarkStyle = {
  text: string;
  size?: number;
  opacity?: number;
  angle?: number;
  color?: string;
  bold?: boolean;
  mode?: 'single' | 'tile';
  gapX?: number;
  gapY?: number;
};

export type WatermarkRenderOpts = WatermarkStyle & {
  width: number;
  height: number;
};

/** Draw watermark overlay onto a 2D context (canvas or bitmap path). */
export function drawWatermark(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  opts: WatermarkRenderOpts
): void {
  const text = opts.text ?? '';
  if (!text) return;
  const { width: w, height: h } = opts;
  const opacity = Math.min(1, Math.max(0.02, opts.opacity ?? 0.18));
  const size = opts.size ?? 42;
  const angle = ((opts.angle ?? 32) * Math.PI) / 180;
  const bold = opts.bold !== false;
  const mode = opts.mode || 'single';
  const color = opts.color || '#333a48';

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;
  ctx.font = `${bold ? 'bold ' : ''}${size}px Inter, "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const drawAt = (x: number, y: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  };

  if (mode === 'tile') {
    const textW = Math.max(size * 2, ctx.measureText(text).width);
    const gapX = opts.gapX ?? Math.max(textW * 1.2, 80);
    const gapY = opts.gapY ?? Math.max(size * 3.2, 64);
    const cols = Math.ceil(w / gapX) + 1;
    const rows = Math.ceil(h / gapY) + 1;
    const sx = (w - (cols - 1) * gapX) / 2;
    const sy = (h - (rows - 1) * gapY) / 2;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        drawAt(sx + c * gapX, sy + r * gapY);
      }
    }
  } else {
    drawAt(w / 2, h / 2);
  }
  ctx.restore();
}
