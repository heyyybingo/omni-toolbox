import { ensureBrowserImage } from '@/engine/jobs';
import { drawWatermark } from '@/engine/watermark';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';

GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export interface LivePreviewResult {
  previewUrl: string;
  originalUrl: string;
  originalSize: number;
  estimatedSize?: number;
  width?: number;
  height?: number;
  naturalWidth?: number;
  naturalHeight?: number;
  info?: string;
}

export function isVisualTool(toolId: string): boolean {
  return [
    'image-convert',
    'image-compress',
    'image-resize',
    'image-watermark',
    'image-transform',
    'image-rotate',
    'image-color',
    'pdf-watermark',
    'pdf-rotate',
    'pdf-img-wm',
  ].includes(toolId);
}

/**
 * Generate a fast, real-time preview of the processed outcome for a sample file.
 */
export async function generateLivePreview(
  file: File,
  toolId: string,
  session: {
    format?: string;
    quality?: number;
    maxEdge?: number;
    targetKb?: number;
    resizeW?: number;
    resizeH?: number;
    resizeKeepAspect?: boolean;
    angle?: number;
    flipH?: boolean;
    flipV?: boolean;
    wmText?: string;
    wmSize?: number;
    wmOpacity?: number;
    wmAngle?: number;
    wmColor?: string;
    wmBold?: boolean;
    wmMode?: 'single' | 'tile';
    wmGapX?: number;
    wmGapY?: number;
    colorBrightness?: number;
    colorContrast?: number;
    colorSaturate?: number;
    stampFile?: File | null;
    stampScale?: number;
  }
): Promise<LivePreviewResult> {
  const originalUrl = URL.createObjectURL(file);
  const originalSize = file.size;

  // Handle PDF Tools
  if (file.type.includes('pdf') || /\.pdf$/i.test(file.name)) {
    const data = new Uint8Array(await file.arrayBuffer());
    const doc = await getDocument({ data }).promise;
    const page = await doc.getPage(1);

    if (toolId === 'pdf-rotate') {
      const rot = (session.angle || 0) % 360;
      const viewport = page.getViewport({ scale: 1.2, rotation: rot });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        await page.render({ canvasContext: ctx, viewport }).promise;
        const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.88));
        if (blob) {
          return {
            previewUrl: URL.createObjectURL(blob),
            originalUrl,
            originalSize,
            width: canvas.width,
            height: canvas.height,
            info: `第 1 页 · 旋转 ${rot}°`,
          };
        }
      }
    }

    if (toolId === 'pdf-watermark') {
      const viewport = page.getViewport({ scale: 1.25 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        await page.render({ canvasContext: ctx, viewport }).promise;
        drawWatermark(ctx, {
          text: session.wmText || '',
          size: session.wmSize || 42,
          opacity: (session.wmOpacity ?? 20) / 100,
          angle: session.wmAngle ?? 30,
          color: session.wmColor || '#333a48',
          bold: session.wmBold ?? true,
          mode: session.wmMode || 'single',
          gapX: session.wmGapX,
          gapY: session.wmGapY,
          width: canvas.width,
          height: canvas.height,
        });
        const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
        if (blob) {
          return {
            previewUrl: URL.createObjectURL(blob),
            originalUrl,
            originalSize,
            width: canvas.width,
            height: canvas.height,
            info: `第 1 页 · 水印实时预览`,
          };
        }
      }
    }

    if (toolId === 'pdf-img-wm' && session.stampFile) {
      const { renderPdfImageStampPreview } = await import('@/engine/pdf-preview');
      const pages = await renderPdfImageStampPreview(file, session.stampFile, {
        opacity: (session.wmOpacity ?? 30) / 100,
        angle: session.wmAngle ?? 32,
        mode: session.wmMode || 'single',
        scale: session.stampScale ?? 0.25,
      });
      if (pages.length > 0) {
        return {
          previewUrl: pages[0],
          originalUrl,
          originalSize,
          info: `第 1 页 · 图片水印预览`,
        };
      }
    }

    // Default PDF view for 1st page
    const viewport = page.getViewport({ scale: 1.2 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      await page.render({ canvasContext: ctx, viewport }).promise;
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
      if (blob) {
        return {
          previewUrl: URL.createObjectURL(blob),
          originalUrl,
          originalSize,
          width: canvas.width,
          height: canvas.height,
          info: '第 1 页',
        };
      }
    }
  }

  // Handle Image Tools
  const decoded = await ensureBrowserImage(file);
  const bmp = await createImageBitmap(decoded);
  const naturalWidth = bmp.width;
  const naturalHeight = bmp.height;

  let targetWidth = naturalWidth;
  let targetHeight = naturalHeight;

  // Max edge scaling
  if (session.maxEdge && session.maxEdge > 0) {
    const scale = Math.min(1, session.maxEdge / Math.max(naturalWidth, naturalHeight));
    targetWidth = Math.round(naturalWidth * scale);
    targetHeight = Math.round(naturalHeight * scale);
  }

  // Resize specific
  if (toolId === 'image-resize') {
    if (session.resizeW && session.resizeW > 0) targetWidth = session.resizeW;
    if (session.resizeH && session.resizeH > 0) targetHeight = session.resizeH;
    if (session.resizeKeepAspect) {
      if (session.resizeW && !session.resizeH) {
        targetHeight = Math.round((naturalHeight / naturalWidth) * targetWidth);
      } else if (session.resizeH && !session.resizeW) {
        targetWidth = Math.round((naturalWidth / naturalHeight) * targetHeight);
      }
    }
  }

  const canvas = document.createElement('canvas');
  let exportMime = session.format || (decoded.type === 'image/png' ? 'image/png' : 'image/jpeg');
  let exportQuality = (session.quality ?? 80) / 100;

  if (toolId === 'image-transform' || toolId === 'image-rotate') {
    const angle = (session.angle || 0) % 360;
    const isQuarter = angle === 90 || angle === 270;
    canvas.width = isQuarter ? targetHeight : targetWidth;
    canvas.height = isQuarter ? targetWidth : targetHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((angle * Math.PI) / 180);
      if (session.flipH) ctx.scale(-1, 1);
      if (session.flipV) ctx.scale(1, -1);
      ctx.drawImage(bmp, -targetWidth / 2, -targetHeight / 2, targetWidth, targetHeight);
    }
  } else {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      if (toolId === 'image-color') {
        const b = session.colorBrightness ?? 100;
        const c = session.colorContrast ?? 100;
        const s = session.colorSaturate ?? 100;
        ctx.filter = `brightness(${b}%) contrast(${c}%) saturate(${s}%)`;
      }
      ctx.drawImage(bmp, 0, 0, targetWidth, targetHeight);

      if (toolId === 'image-watermark') {
        drawWatermark(ctx, {
          text: session.wmText || '',
          size: session.wmSize || 36,
          opacity: (session.wmOpacity ?? 25) / 100,
          angle: session.wmAngle ?? 32,
          color: session.wmColor || '#ffffff',
          bold: session.wmBold ?? true,
          mode: session.wmMode || 'single',
          gapX: session.wmGapX,
          gapY: session.wmGapY,
          width: targetWidth,
          height: targetHeight,
        });
      }
    }
  }

  bmp.close();

  // If compression targetKb specified, estimate required quality
  if (toolId === 'image-compress' && session.targetKb && session.targetKb > 0) {
    const targetBytes = session.targetKb * 1024;
    let bestBlob: Blob | null = null;
    let lo = 0.1;
    let hi = 0.95;
    for (let i = 0; i < 4; i++) {
      const mid = (lo + hi) / 2;
      const b = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', mid));
      if (b) {
        bestBlob = b;
        if (b.size > targetBytes) hi = mid;
        else lo = mid;
      }
    }
    if (bestBlob) {
      return {
        previewUrl: URL.createObjectURL(bestBlob),
        originalUrl,
        originalSize,
        estimatedSize: bestBlob.size,
        width: canvas.width,
        height: canvas.height,
        naturalWidth,
        naturalHeight,
        info: `目标体积试算: ~${Math.round(bestBlob.size / 1024)} KB`,
      };
    }
  }

  const blob = await new Promise<Blob | null>((res) =>
    canvas.toBlob(res, exportMime, exportQuality)
  );

  const previewUrl = blob ? URL.createObjectURL(blob) : originalUrl;
  const estimatedSize = blob?.size;

  return {
    previewUrl,
    originalUrl,
    originalSize,
    estimatedSize,
    width: canvas.width,
    height: canvas.height,
    naturalWidth,
    naturalHeight,
  };
}
