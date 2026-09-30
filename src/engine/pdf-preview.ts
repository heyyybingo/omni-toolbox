import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import { drawWatermark, type WatermarkStyle } from '@/engine/watermark';

GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export type WmPreviewOpts = WatermarkStyle;

/** Render every PDF page with watermark overlay; caller stacks images for scrolling. */
export async function renderPdfWatermarkPreviewPages(
  file: File,
  opts: WmPreviewOpts,
  maxPages = 30
): Promise<string[]> {
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await getDocument({ data }).promise;
  const total = Math.min(doc.numPages, maxPages);
  const pages: string[] = [];

  for (let p = 1; p <= total; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1.25 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport }).promise;
    drawWatermark(ctx, {
      ...opts,
      width: canvas.width,
      height: canvas.height,
      size: opts.size ?? 42,
    });
    pages.push(canvas.toDataURL('image/png'));
    page.cleanup();
  }

  return pages;
}

/** Single-page preview (kept for compatibility). */
export async function renderPdfWatermarkPreview(
  file: File,
  opts: WmPreviewOpts,
  pageIndex = 0
): Promise<string> {
  const pages = await renderPdfWatermarkPreviewPages(file, opts, pageIndex + 1);
  return pages[pageIndex] || pages[0] || '';
}

/** Preview PDF with image stamp overlaid (same style as export). */
export async function renderPdfImageStampPreview(
  file: File,
  stamp: File,
  opts: {
    opacity?: number;
    angle?: number;
    mode?: 'single' | 'tile';
    scale?: number;
    gapX?: number;
    gapY?: number;
  }
): Promise<string[]> {
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await getDocument({ data }).promise;
  const total = Math.min(doc.numPages, 8);
  const stampUrl = URL.createObjectURL(stamp);
  const stampImg = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = stampUrl;
  });

  const pages: string[] = [];
  for (let p = 1; p <= total; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1.15 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport }).promise;

    const w = canvas.width;
    const h = canvas.height;
    const s = opts.scale ?? 0.25;
    const dw = w * s;
    const dh = (stampImg.naturalHeight / stampImg.naturalWidth) * dw;
    const angle = ((opts.angle ?? 32) * Math.PI) / 180;
    const opacity = opts.opacity ?? 0.25;

    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0.02, opacity));
    const drawOne = (x: number, y: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.drawImage(stampImg, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    };
    if (opts.mode === 'tile') {
      const gapX = opts.gapX ?? dw * 2.2;
      const gapY = opts.gapY ?? dh * 3;
      const cols = Math.ceil(w / gapX) + 1;
      const rows = Math.ceil(h / gapY) + 1;
      const sx = (w - (cols - 1) * gapX) / 2;
      const sy = (h - (rows - 1) * gapY) / 2;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) drawOne(sx + c * gapX, sy + r * gapY);
      }
    } else {
      drawOne(w / 2, h / 2);
    }
    ctx.restore();
    pages.push(canvas.toDataURL('image/png'));
    page.cleanup();
  }
  URL.revokeObjectURL(stampUrl);
  return pages;
}

/** Render image + same watermark style for inspector preview. */
export async function renderImageWatermarkPreview(
  file: File,
  opts: WmPreviewOpts
): Promise<string> {
  const bmp = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bmp.close();
    throw new Error('Canvas unavailable');
  }
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  drawWatermark(ctx, {
    ...opts,
    width: canvas.width,
    height: canvas.height,
    size: opts.size ?? Math.max(18, Math.round(Math.min(canvas.width, canvas.height) / 12)),
  });
  return canvas.toDataURL('image/png');
}
