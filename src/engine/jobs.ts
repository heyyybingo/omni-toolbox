import { WorkerPool } from '@/engine/worker-pool';
import {
  baseName,
  encodeWavFromChannels,
  createZip,
  formatBytes,
  uniqueName,
  downloadBlob,
} from '@/lib/utils';
import { PDFDocument } from 'pdf-lib';
import {
  addPageNumbers,
  cropPdfRect,
  deletePdfPages,
  encryptPdf,
  nupPdf,
  reorderPdfPages,
  watermarkPdfBitmap,
} from '@/engine/pdf-ops';
import { drawWatermark, type WatermarkStyle } from '@/engine/watermark';

export type JobResult = {
  name: string;
  blob: Blob;
  size: number;
  inputSize: number;
  note?: string;
};

export type ImageSettings = {
  mime: string | null;
  quality: number;
  maxEdge: number;
};

export type AudioExportOptions = {
  format: 'wav' | 'mp3' | 'flac';
  sampleRate?: number;
  channels?: 'source' | 'mono' | 'stereo';
  bitDepth?: 16 | 24 | 32;
  mp3Kbps?: number;
};

let imagePool: WorkerPool | null = null;
let pdfPool: WorkerPool | null = null;

function getPools(): { imagePool: WorkerPool; pdfPool: WorkerPool } {
  if (!imagePool) {
    imagePool = new WorkerPool(new URL('../workers/image-worker.ts', import.meta.url), 'image');
  }
  if (!pdfPool) {
    pdfPool = new WorkerPool(new URL('../workers/pdf-worker.ts', import.meta.url), 'pdf');
  }
  return { imagePool: imagePool!, pdfPool: pdfPool! };
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    imagePool?.destroy();
    pdfPool?.destroy();
    imagePool = null;
    pdfPool = null;
  });
}

function floatTo16(f32: Float32Array): Int16Array {
  const out = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

async function encodeMp3(
  channels: Float32Array[],
  sampleRate: number,
  kbps: number
): Promise<ArrayBuffer> {
  const mod = await import('lamejs');
  const lameNs = (mod as unknown as {
    Mp3Encoder: new (ch: number, sr: number, kbps: number) => {
      encodeBuffer(left: Int16Array, right?: Int16Array): Int8Array;
      flush(): Int8Array;
    };
    default?: unknown;
  });
  const Mp3Encoder =
    lameNs.Mp3Encoder ||
    ((lameNs.default as typeof lameNs).Mp3Encoder as typeof lameNs.Mp3Encoder);
  const mono = channels.length === 1;
  const enc = new Mp3Encoder(mono ? 1 : 2, sampleRate, kbps);
  const left = floatTo16(channels[0]);
  const right = mono ? undefined : floatTo16(channels[1] || channels[0]);
  const blocks: Int8Array[] = [];
  const block = 1152;
  for (let i = 0; i < left.length; i += block) {
    const l = left.subarray(i, i + block);
    const r = right ? right.subarray(i, i + block) : undefined;
    const mp3buf = mono ? enc.encodeBuffer(l) : enc.encodeBuffer(l, r);
    if (mp3buf.length) blocks.push(mp3buf);
  }
  const end = enc.flush();
  if (end.length) blocks.push(end);
  let total = 0;
  for (const b of blocks) total += b.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const b of blocks) {
    out.set(b, off);
    off += b.length;
  }
  return out.buffer;
}

export async function processImageJob(
  file: File,
  options: {
    type: 'convert' | 'compress' | 'exif';
    mime: string;
    quality: number;
    maxEdge: number;
  }
): Promise<JobResult> {
  const src = await ensureBrowserImage(file);
  const buffer = await src.arrayBuffer();
  const result = await getPools().imagePool.run<{
    buffer: ArrayBuffer;
    mime: string;
    width: number;
    height: number;
    size: number;
  }>(
    {
      id: `${Date.now()}-${Math.random()}`,
      type: options.type,
      buffer,
      mime: options.mime,
      quality: options.quality,
      maxEdge: options.maxEdge,
      filename: file.name,
    },
    [buffer]
  );
  const ext =
    options.mime === 'image/jpeg' ? 'jpg' : options.mime === 'image/png' ? 'png' : 'webp';
  return {
    name: `${baseName(file.name)}.${ext}`,
    blob: new Blob([result.buffer], { type: options.mime }),
    size: result.size,
    inputSize: file.size,
    note: `${result.width}×${result.height}`,
  };
}

export async function processImageResize(
  file: File,
  opts: {
    width?: number;
    height?: number;
    keepAspect?: boolean;
    mime?: string;
    quality?: number;
  }
): Promise<JobResult> {
  const bmp = await createImageBitmap(file);
  let w = opts.width || bmp.width;
  let h = opts.height || bmp.height;
  if (opts.keepAspect !== false && (opts.width || opts.height)) {
    const scale = Math.min(
      opts.width ? opts.width / bmp.width : 1,
      opts.height ? opts.height / bmp.height : 1
    );
    w = Math.max(1, Math.round(bmp.width * scale));
    h = Math.max(1, Math.round(bmp.height * scale));
  }
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bmp.close();
    throw new Error('Canvas 2D unavailable');
  }
  if ((opts.mime || file.type) === 'image/jpeg') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const mime = opts.mime || file.type || 'image/png';
  const blob = await canvas.convertToBlob({ type: mime, quality: opts.quality ?? 0.92 });
  return {
    name: `${baseName(file.name)}-resized.${
      mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png'
    }`,
    blob,
    size: blob.size,
    inputSize: file.size,
    note: `${w}×${h}`,
  };
}

export async function processImageTransform(
  file: File,
  opts: {
    rotate?: 0 | 90 | 180 | 270;
    flipH?: boolean;
    flipV?: boolean;
    mime?: string;
    quality?: number;
  }
): Promise<JobResult> {
  const bmp = await createImageBitmap(file);
  const rotate = opts.rotate || 0;
  const swap = rotate === 90 || rotate === 270;
  const w = swap ? bmp.height : bmp.width;
  const h = swap ? bmp.width : bmp.height;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bmp.close();
    throw new Error('Canvas unavailable');
  }
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate((rotate * Math.PI) / 180);
  ctx.scale(opts.flipH ? -1 : 1, opts.flipV ? -1 : 1);
  ctx.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
  ctx.restore();
  bmp.close();
  const mime = opts.mime || file.type || 'image/png';
  const blob = await canvas.convertToBlob({ type: mime, quality: opts.quality ?? 0.92 });
  return {
    name: `${baseName(file.name)}-xform.${
      mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png'
    }`,
    blob,
    size: blob.size,
    inputSize: file.size,
    note: `${w}×${h}`,
  };
}

export async function processImageWatermark(
  file: File,
  opts: WatermarkStyle
): Promise<JobResult> {
  const bmp = await createImageBitmap(file);
  const w = bmp.width;
  const h = bmp.height;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bmp.close();
    throw new Error('Canvas 2D unavailable');
  }
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  if (!opts.text) throw new Error('水印文字为空');
  drawWatermark(ctx, {
    ...opts,
    width: w,
    height: h,
    size: opts.size ?? Math.max(18, Math.round(Math.min(w, h) / 12)),
  });
  const mime =
    file.type === 'image/jpeg' ? 'image/jpeg' : file.type === 'image/webp' ? 'image/webp' : 'image/png';
  const blob = await canvas.convertToBlob({ type: mime, quality: 0.92 });
  return {
    name: `${baseName(file.name)}-wm.${
      mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png'
    }`,
    blob,
    size: blob.size,
    inputSize: file.size,
  };
}

export async function processPdfEach(
  file: File,
  type: 'split' | 'rotate' | 'watermark',
  payload: Record<string, unknown>
): Promise<JobResult> {
  const buffer = await file.arrayBuffer();
  const result = await getPools().pdfPool.run<{ buffer: ArrayBuffer; size: number }>(
    {
      id: `${Date.now()}-${Math.random()}`,
      type,
      payload: { ...payload, buffer },
    },
    [buffer]
  );
  return {
    name: `${baseName(file.name)}-${type}.pdf`,
    blob: new Blob([result.buffer], { type: 'application/pdf' }),
    size: result.size,
    inputSize: file.size,
  };
}

export async function processPdfImageWatermark(
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
): Promise<JobResult> {
  const buffer = await file.arrayBuffer();
  const imageBytes = new Uint8Array(await stamp.arrayBuffer());
  const out = await watermarkPdfBitmap(buffer, 'img', {
    imageBytes,
    opacity: opts.opacity,
    angle: opts.angle,
    mode: opts.mode,
    gapX: opts.gapX,
    gapY: opts.gapY,
    scale: opts.scale,
  });
  const ab = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
  return {
    name: `${baseName(file.name)}-imgwm.pdf`,
    blob: new Blob([ab], { type: 'application/pdf' }),
    size: ab.byteLength,
    inputSize: file.size,
    note: '图片水印',
  };
}

export async function processPdfEncrypt(
  file: File,
  opts: {
    userPassword: string;
    ownerPassword?: string;
    permissions?: {
      printing?: boolean;
      copying?: boolean;
      modifying?: boolean;
      annotating?: boolean;
      fillingForms?: boolean;
      assembling?: boolean;
      accessibility?: boolean;
    };
  }
): Promise<JobResult> {
  const buffer = await file.arrayBuffer();
  const out = await encryptPdf(buffer, opts);
  const ab = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
  return {
    name: `${baseName(file.name)}-protected.pdf`,
    blob: new Blob([ab], { type: 'application/pdf' }),
    size: ab.byteLength,
    inputSize: file.size,
    note: '已加密',
  };
}

export async function processImageStitch(
  files: File[],
  opts: { direction: 'v' | 'h'; gap?: number; mime?: string }
): Promise<JobResult> {
  const bitmaps = await Promise.all(files.map((f) => createImageBitmap(f)));
  const gap = opts.gap ?? 0;
  const v = opts.direction === 'v';
  const width = v
    ? Math.max(...bitmaps.map((b) => b.width))
    : bitmaps.reduce((s, b) => s + b.width, 0) + gap * (bitmaps.length - 1);
  const height = v
    ? bitmaps.reduce((s, b) => s + b.height, 0) + gap * (bitmaps.length - 1)
    : Math.max(...bitmaps.map((b) => b.height));
  const canvas = new OffscreenCanvas(Math.max(1, width), Math.max(1, height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  let x = 0;
  let y = 0;
  for (const b of bitmaps) {
    if (v) {
      x = (width - b.width) / 2;
      ctx.drawImage(b, x, y);
      y += b.height + gap;
    } else {
      y = (height - b.height) / 2;
      ctx.drawImage(b, x, y);
      x += b.width + gap;
    }
    b.close();
  }
  const mime = opts.mime || 'image/png';
  const blob = await canvas.convertToBlob({ type: mime, quality: 0.92 });
  return {
    name: `stitched-${v ? 'v' : 'h'}.${mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png'}`,
    blob,
    size: blob.size,
    inputSize: files.reduce((s, f) => s + f.size, 0),
    note: `${files.length} 图 · ${width}×${height}`,
  };
}

/** Downscaled stitch preview data URL for UI. */
export async function renderStitchPreview(
  files: File[],
  opts: { direction: 'v' | 'h'; gap?: number; maxWidth?: number }
): Promise<string> {
  const bitmaps = await Promise.all(files.slice(0, 12).map((f) => createImageBitmap(f)));
  const gap = opts.gap ?? 0;
  const v = opts.direction === 'v';
  const fullW = v
    ? Math.max(...bitmaps.map((b) => b.width))
    : bitmaps.reduce((s, b) => s + b.width, 0) + gap * (bitmaps.length - 1);
  const fullH = v
    ? bitmaps.reduce((s, b) => s + b.height, 0) + gap * (bitmaps.length - 1)
    : Math.max(...bitmaps.map((b) => b.height));
  const maxW = opts.maxWidth ?? 480;
  const scale = Math.min(1, maxW / Math.max(fullW, 1), 420 / Math.max(fullH, 1) || 1);
  const width = Math.max(1, Math.round(fullW * scale));
  const height = Math.max(1, Math.round(fullH * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = '#f1f2f4';
  ctx.fillRect(0, 0, width, height);
  let x = 0;
  let y = 0;
  for (const b of bitmaps) {
    const w = b.width * scale;
    const h = b.height * scale;
    if (v) {
      x = (width - w) / 2;
      ctx.drawImage(b, x, y, w, h);
      y += h + gap * scale;
    } else {
      y = (height - h) / 2;
      ctx.drawImage(b, x, y, w, h);
      x += w + gap * scale;
    }
    b.close();
  }
  return canvas.toDataURL('image/jpeg', 0.85);
}

export async function processPdfHeaderFooter(
  file: File,
  opts: { header?: string; footer?: string }
): Promise<JobResult> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const buffer = await file.arrayBuffer();
  const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const font = await src.embedFont(StandardFonts.Helvetica);
  const pages = src.getPages();
  pages.forEach((page, i) => {
    const { height } = page.getSize();
    if (opts.header) {
      const text = opts.header.replace('{n}', String(i + 1)).replace('{total}', String(pages.length));
      page.drawText(text, { x: 40, y: height - 28, size: 9, font, color: rgb(0.35, 0.35, 0.4) });
    }
    if (opts.footer) {
      const text = opts.footer.replace('{n}', String(i + 1)).replace('{total}', String(pages.length));
      page.drawText(text, { x: 40, y: 16, size: 9, font, color: rgb(0.35, 0.35, 0.4) });
    }
  });
  const out = await src.save({ useObjectStreams: true });
  const ab = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
  return {
    name: `${baseName(file.name)}-hf.pdf`,
    blob: new Blob([ab], { type: 'application/pdf' }),
    size: ab.byteLength,
    inputSize: file.size,
    note: '页眉/页脚',
  };
}

export async function processPdfDecrypt(
  file: File,
  password: string
): Promise<JobResult> {
  // Verify password with pdf.js, then rewrite via pdf-lib without encryption.
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
  const data = new Uint8Array(await file.arrayBuffer());
  try {
    await pdfjs.getDocument({ data, password }).promise;
  } catch {
    throw new Error('密码错误或无法解锁该 PDF');
  }
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.load(data, { ignoreEncryption: true, updateMetadata: false });
  const out = await doc.save({ useObjectStreams: true });
  const ab = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
  return {
    name: `${baseName(file.name)}-decrypted.pdf`,
    blob: new Blob([ab], { type: 'application/pdf' }),
    size: ab.byteLength,
    inputSize: file.size,
    note: '已解锁',
  };
}

export async function processImageColor(
  file: File,
  opts: {
    brightness?: number;
    contrast?: number;
    saturate?: number;
    mime?: string;
    quality?: number;
  }
): Promise<JobResult> {
  const bmp = await createImageBitmap(file);
  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bmp.close();
    throw new Error('Canvas unavailable');
  }
  const b = Math.max(0.1, opts.brightness ?? 1);
  const c = Math.max(0.1, opts.contrast ?? 1);
  const s = Math.max(0, opts.saturate ?? 1);
  // OffscreenCanvas 2d filter support varies; fallback draw without filter if missing
  type FilterCtx = OffscreenCanvasRenderingContext2D & { filter?: string };
  const c2 = ctx as FilterCtx;
  try {
    c2.filter = `brightness(${b}) contrast(${c}) saturate(${s})`;
  } catch {
    /* ignore */
  }
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  const mime = opts.mime || file.type || 'image/png';
  const blob = await canvas.convertToBlob({ type: mime, quality: opts.quality ?? 0.92 });
  return {
    name: `${baseName(file.name)}-color.${mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png'}`,
    blob,
    size: blob.size,
    inputSize: file.size,
    note: `B${b} C${c} S${s}`,
  };
}

export async function processImageStamp(
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
): Promise<JobResult> {
  const bmp = await createImageBitmap(file);
  const stampBmp = await createImageBitmap(stamp);
  const W0 = bmp.width;
  const H0 = bmp.height;
  const canvas = new OffscreenCanvas(W0, H0);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bmp.close();
    stampBmp.close();
    throw new Error('Canvas unavailable');
  }
  ctx.drawImage(bmp, 0, 0);
  bmp.close();

  const scale = Math.min(0.6, Math.max(0.05, opts.scale ?? 0.2));
  const w = W0 * scale;
  const h = (stampBmp.height / stampBmp.width) * w;
  const angle = ((opts.angle ?? 32) * Math.PI) / 180;
  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0.02, opts.opacity ?? 0.25));
  const drawOne = (x: number, y: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.drawImage(stampBmp, -w / 2, -h / 2, w, h);
    ctx.restore();
  };
  const W = canvas.width;
  const H = canvas.height;
  if (opts.mode === 'tile') {
    const gapX = opts.gapX ?? w * 2.2;
    const gapY = opts.gapY ?? h * 3;
    const cols = Math.ceil(W / gapX) + 1;
    const rows = Math.ceil(H / gapY) + 1;
    const sx = (W - (cols - 1) * gapX) / 2;
    const sy = (H - (rows - 1) * gapY) / 2;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) drawOne(sx + c * gapX, sy + r * gapY);
    }
  } else {
    drawOne(W / 2, H / 2);
  }
  ctx.restore();
  stampBmp.close();

  const mime = file.type === 'image/jpeg' ? 'image/jpeg' : file.type === 'image/webp' ? 'image/webp' : 'image/png';
  const blob = await canvas.convertToBlob({ type: mime, quality: 0.92 });
  return {
    name: `${baseName(file.name)}-logo.${mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png'}`,
    blob,
    size: blob.size,
    inputSize: file.size,
  };
}

/** OCR → searchable PDF: raster pages + invisible text layer. */
export async function processSearchablePdf(
  file: File,
  opts: { lang?: string; scale?: number } = {}
): Promise<JobResult> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const { createWorker } = await import('tesseract.js');

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  const worker = await createWorker(opts.lang || 'eng', 1, { logger: () => undefined });
  const scale = opts.scale || 1.6;

  try {
    for (let i = 1; i <= Math.min(doc.numPages, 20); i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      const png = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png')
      );
      const img = await out.embedPng(new Uint8Array(await png.arrayBuffer()));
      // PDF page in pt (~ canvas px * 72/96)
      const pw = canvas.width * (72 / 96);
      const ph = canvas.height * (72 / 96);
      const pdfPage = out.addPage([pw, ph]);
      pdfPage.drawImage(img, { x: 0, y: 0, width: pw, height: ph });

      const { data: ocr } = await worker.recognize(canvas);
      type OcrBox = { x0: number; y0: number; x1: number; y1: number };
      type OcrItem = { text?: string; bbox?: OcrBox };
      const words = ((ocr as unknown as { words?: OcrItem[] }).words ||
        (ocr as unknown as { lines?: OcrItem[] }).lines ||
        []) as OcrItem[];
      for (const w of words) {
        if (!w.text?.trim() || !w.bbox) continue;
        const x = (w.bbox.x0 * 72) / 96;
        const yTop = (w.bbox.y0 * 72) / 96;
        const h = Math.max(6, ((w.bbox.y1 - w.bbox.y0) * 72) / 96);
        pdfPage.drawText(w.text, {
          x,
          y: ph - yTop - h * 0.85,
          size: Math.min(24, h * 0.8),
          font,
          color: rgb(0, 0, 0),
          opacity: 0.01,
        });
      }
      page.cleanup();
    }
    const outBuf = await out.save({ useObjectStreams: true });
    const ab = outBuf.buffer.slice(outBuf.byteOffset, outBuf.byteOffset + outBuf.byteLength) as ArrayBuffer;
    return {
      name: `${baseName(file.name)}-searchable.pdf`,
      blob: new Blob([ab], { type: 'application/pdf' }),
      size: ab.byteLength,
      inputSize: file.size,
      note: '含文字层',
    };
  } finally {
    await worker.terminate();
  }
}

export type IdFields = Record<string, string>;

/** Extract common ID fields from OCR text. */
export function parseIdFields(text: string): { type: string; fields: IdFields } {
  const t = text.replace(/\s+/g, ' ').trim();
  const id18 = t.match(/\b\d{17}[\dXx]\b/);
  const card = t.match(/\b(?:\d[ -]*?){13,19}\b/);
  const mrz = t.match(/[A-Z0-9<]{30,}/g);
  const invoiceNo = t.match(/(?:发票号码|发票号|Invoice\s*(?:No\.?|Number)?)\s*[:：]?\s*([A-Z0-9-]{6,})/i);
  const amount = t.match(/(?:金额|合计|Total|Amount)\s*[:：]?\s*[¥$]?\s*([\d,]+(?:\.\d{1,2})?)/i);
  const date = t.match(/(\d{4}[-/年.]\d{1,2}[-/月.]\d{1,2})/);
  const taxNo = t.match(/\b([0-9A-Z]{18})\b/);

  if (id18) {
    return {
      type: 'id-card',
      fields: {
        公民身份号码: id18[0],
        姓名: (t.match(/姓名\s*([一-龥A-Za-z·]+)/) || [])[1] || '',
        性别: (t.match(/性别\s*(男|女)/) || [])[1] || '',
        出生: (t.match(/(\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日)/) || [])[1] || '',
        地址: (t.match(/住址\s*(.{6,50})/) || [])[1]?.trim() || '',
        签发机关: (t.match(/签发机关\s*([^\s]{2,20})/) || [])[1] || '',
      },
    };
  }
  if (invoiceNo || amount) {
    return {
      type: 'invoice',
      fields: {
        发票号码: invoiceNo?.[1] || '',
        金额: amount?.[1] || '',
        日期: date?.[1] || '',
        识别号: taxNo?.[1] || '',
      },
    };
  }
  if (card && card[0].replace(/\D/g, '').length >= 13) {
    return {
      type: 'bank-card',
      fields: {
        卡号: card[0].replace(/[ -]/g, ''),
      },
    };
  }
  if (mrz && mrz.length) {
    return {
      type: 'passport',
      fields: {
        机读码: mrz.join(' '),
      },
    };
  }
  return { type: 'unknown', fields: { 全文: t.slice(0, 500) } };
}

export async function processIdOcr(file: File, opts: { lang?: string } = {}): Promise<JobResult> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker(opts.lang || 'eng+chi_sim', 1, { logger: () => undefined });
  try {
    let src: Blob = file;
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
      const pages = await processPdfToImages(file, 1.8);
      if (!pages.length) throw new Error('无法读取 PDF');
      src = pages[0].blob;
    }
    const url = URL.createObjectURL(src);
    const { data } = await worker.recognize(url);
    URL.revokeObjectURL(url);
    const parsed = parseIdFields(data.text || '');
    const json = JSON.stringify(parsed, null, 2);
    return {
      name: `${baseName(file.name)}-id.json`,
      blob: new Blob([json], { type: 'application/json' }),
      size: new Blob([json]).size,
      inputSize: file.size,
      note: `类型=${parsed.type}`,
    };
  } finally {
    await worker.terminate();
  }
}

export async function processVideoCover(file: File, timeSec = 1): Promise<JobResult> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('无法读取视频'));
    });
    video.currentTime = Math.min(Math.max(0, timeSec), Math.max(0, video.duration - 0.1));
    await new Promise((r) => {
      video.onseeked = () => r(undefined);
    });
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(video, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/jpeg', 0.92)
    );
    return {
      name: `${baseName(file.name)}-cover.jpg`,
      blob,
      size: blob.size,
      inputSize: file.size,
      note: `@${timeSec}s`,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function processVideoToGif(
  file: File,
  opts: { startSec?: number; endSec?: number; width?: number; fps?: number }
): Promise<JobResult> {
  const gifenc = await import('gifenc');
  const { GIFEncoder, quantize, applyPalette } = gifenc as unknown as {
    GIFEncoder: () => { writeFrame: (i: Uint8Array, w: number, h: number, opts: unknown) => void; finish: () => Uint8Array };
    quantize: (d: Uint8Array, max: number) => unknown;
    applyPalette: (d: Uint8Array, p: unknown, fmt?: string) => Uint8Array;
  };
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('无法读取视频'));
    });
    const start = Math.max(0, opts.startSec || 0);
    const end = Math.min(video.duration, opts.endSec || Math.min(video.duration, start + 5));
    const fps = opts.fps || 8;
    const targetW = opts.width || 480;
    const scale = Math.min(1, targetW / video.videoWidth);
    const w = Math.max(1, Math.round(video.videoWidth * scale));
    const h = Math.max(1, Math.round(video.videoHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    const gif = GIFEncoder();
    const frames = Math.max(1, Math.floor((end - start) * fps));
    for (let i = 0; i < frames; i++) {
      const t = start + i / fps;
      video.currentTime = Math.min(t, end - 0.05);
      await new Promise((r) => {
        video.onseeked = () => r(undefined);
      });
      ctx.drawImage(video, 0, 0, w, h);
      const image = new Uint8Array(ctx.getImageData(0, 0, w, h).data.buffer);
      const palette = quantize(image, 256);
      const index = applyPalette(image, palette);
      gif.writeFrame(index, w, h, { palette, delay: Math.round(1000 / fps) });
    }
    const bytes = gif.finish();
    return {
      name: `${baseName(file.name)}.gif`,
      blob: new Blob([bytes as unknown as BlobPart], { type: 'image/gif' }),
      size: bytes.length,
      inputSize: file.size,
      note: `${w}×${h} · ${frames} 帧`,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function processVideoExtractAudio(file: File): Promise<JobResult> {
  // Use WebAudio by demuxing is limited; extract via MediaElement → OfflineAudioContext is not available for video.
  // Fallback: use video as audio source through AudioContext + MediaStreamDestination + MediaRecorder (webm/opus).
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('无法读取视频'));
    });
    const ctx = new AudioContext();
    const dest = ctx.createMediaStreamDestination();
    const src = ctx.createMediaElementSource(video);
    src.connect(dest);
    const rec = new MediaRecorder(dest.stream, { mimeType: 'audio/webm' });
    const chunks: BlobPart[] = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    const done = new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
    });
    video.currentTime = 0;
    rec.start();
    await video.play();
    await new Promise<void>((resolve) => {
      video.onended = () => resolve();
    });
    rec.stop();
    await done;
    await ctx.close();
    const blob = new Blob(chunks, { type: 'audio/webm' });
    return {
      name: `${baseName(file.name)}-audio.webm`,
      blob,
      size: blob.size,
      inputSize: file.size,
      note: 'WebM 音轨',
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function processPdfFillForm(
  file: File,
  values: Record<string, string>
): Promise<JobResult> {
  const { PDFDocument } = await import('pdf-lib');
  const buffer = await file.arrayBuffer();
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true, updateMetadata: false });
  const form = doc.getForm();
  for (const [name, value] of Object.entries(values)) {
    if (!value) continue;
    try {
      const field = form.getField(name);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (field as any).setText?.(value);
    } catch {
      /* field may be non-text */
    }
  }
  const out = await doc.save({ useObjectStreams: true });
  const ab = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
  return {
    name: `${baseName(file.name)}-filled.pdf`,
    blob: new Blob([ab], { type: 'application/pdf' }),
    size: ab.byteLength,
    inputSize: file.size,
    note: '表单已填',
  };
}

export async function processPdfBookmarks(
  file: File,
  titles: string[]
): Promise<JobResult> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const buffer = await file.arrayBuffer();
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const pageCount = doc.getPageCount();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  page.drawText('目录 / TOC', { x: 48, y: 780, size: 18, font });
  titles.slice(0, 40).forEach((raw, i) => {
    const m = raw.match(/^(.*?)(?:\s*[:：|]\s*|\s+)(\d{1,4})$/);
    const title = (m?.[1] || raw).trim();
    const pageNo = m ? Number(m[2]) : Math.min(pageCount, i + 1);
    const y = 740 - i * 22;
    page.drawText(`${i + 1}. ${title}`, { x: 48, y, size: 11, font, color: rgb(0.15, 0.2, 0.3) });
    const label = String(pageNo);
    const w = font.widthOfTextAtSize(label, 11);
    page.drawText(label, { x: 560 - w, y, size: 11, font, color: rgb(0.15, 0.2, 0.3) });
  });
  const out = await doc.save({ useObjectStreams: true });
  const ab = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
  return {
    name: `${baseName(file.name)}-toc.pdf`,
    blob: new Blob([ab], { type: 'application/pdf' }),
    size: ab.byteLength,
    inputSize: file.size,
    note: `${titles.length} 条 · 带页码`,
  };
}

export async function processVideoTrim(
  file: File,
  opts: { startSec: number; endSec: number }
): Promise<JobResult> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('无法读取视频'));
    });
    const start = Math.max(0, opts.startSec || 0);
    const end = Math.min(video.duration, opts.endSec || video.duration);
    if (end <= start) throw new Error('结束时间必须大于开始时间');

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    const stream = canvas.captureStream(30);
    const videoTrackStream = (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.();
    if (videoTrackStream) {
      for (const t of videoTrackStream.getAudioTracks()) stream.addTrack(t);
    }

    const rec = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp8,opus',
    });
    const chunks: BlobPart[] = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    const done = new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
    });

    video.currentTime = start;
    await new Promise((r) => {
      video.onseeked = () => r(undefined);
    });
    rec.start();
    await video.play();
    const draw = () => {
      if (video.ended || video.currentTime >= end) {
        rec.stop();
        return;
      }
      ctx.drawImage(video, 0, 0);
      requestAnimationFrame(draw);
    };
    draw();
    await done;
    const blob = new Blob(chunks, { type: 'video/webm' });
    return {
      name: `${baseName(file.name)}-trim.webm`,
      blob,
      size: blob.size,
      inputSize: file.size,
      note: `${start.toFixed(1)}s–${end.toFixed(1)}s`,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function processAudioConcat(files: File[]): Promise<JobResult> {
  const ctx = new AudioContext();
  try {
    const buffers: AudioBuffer[] = [];
    for (const f of files) {
      const ab = await ctx.decodeAudioData(await f.arrayBuffer());
      buffers.push(ab);
    }
    const rate = buffers[0].sampleRate;
    const channels = Math.max(...buffers.map((b) => b.numberOfChannels));
    const total = buffers.reduce((s, b) => s + b.length, 0);
    const out = ctx.createBuffer(channels, total, rate);
    let offset = 0;
    for (const b of buffers) {
      for (let c = 0; c < channels; c++) {
        const src = b.getChannelData(Math.min(c, b.numberOfChannels - 1));
        out.getChannelData(c).set(src, offset);
      }
      offset += b.length;
    }
    const planar: Float32Array[] = [];
    for (let c = 0; c < channels; c++) planar.push(out.getChannelData(c));
    const wav = encodeWavFromChannels(planar, rate, 16);
    return {
      name: `joined-${Date.now()}.wav`,
      blob: new Blob([wav], { type: 'audio/wav' }),
      size: wav.byteLength,
      inputSize: files.reduce((s, f) => s + f.size, 0),
      note: `${files.length} 段`,
    };
  } finally {
    void ctx.close();
  }
}

export async function processPdfOutlines(
  file: File,
  titles: string[]
): Promise<JobResult> {
  const { addPdfOutlines } = await import('@/engine/pdf-ops');
  const buffer = await file.arrayBuffer();
  const items = titles.map((raw, i) => {
    const m = raw.match(/^(.*?)(?:\s*[:：|]\s*|\s+)(\d{1,4})$/);
    return {
      title: (m?.[1] || raw).trim(),
      pageIndex: m ? Number(m[2]) - 1 : i,
    };
  });
  const out = await addPdfOutlines(buffer, items);
  const ab = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
  return {
    name: `${baseName(file.name)}-bookmarks.pdf`,
    blob: new Blob([ab], { type: 'application/pdf' }),
    size: ab.byteLength,
    inputSize: file.size,
    note: `${items.length} 个书签`,
  };
}

export async function processPdfDeletePages(file: File, range: string): Promise<JobResult> {
  const buffer = await file.arrayBuffer();
  const out = await deletePdfPages(buffer, range);
  const ab = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
  return {
    name: `${baseName(file.name)}-deleted.pdf`,
    blob: new Blob([ab], { type: 'application/pdf' }),
    size: ab.byteLength,
    inputSize: file.size,
  };
}

export async function processPdfReorder(file: File, order: string): Promise<JobResult> {
  const buffer = await file.arrayBuffer();
  const out = await reorderPdfPages(buffer, order);
  const ab = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
  return {
    name: `${baseName(file.name)}-reordered.pdf`,
    blob: new Blob([ab], { type: 'application/pdf' }),
    size: ab.byteLength,
    inputSize: file.size,
  };
}

export async function processPdfNup(file: File, n: 2 | 4): Promise<JobResult> {
  const buffer = await file.arrayBuffer();
  const out = await nupPdf(buffer, n);
  const ab = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
  return {
    name: `${baseName(file.name)}-nup${n}.pdf`,
    blob: new Blob([ab], { type: 'application/pdf' }),
    size: ab.byteLength,
    inputSize: file.size,
    note: `${n} 合 1`,
  };
}

export async function processPdfCrop(
  file: File,
  rect: { x: number; y: number; w: number; h: number }
): Promise<JobResult> {
  const buffer = await file.arrayBuffer();
  const out = await cropPdfRect(buffer, rect);
  const ab = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
  return {
    name: `${baseName(file.name)}-cropped.pdf`,
    blob: new Blob([ab], { type: 'application/pdf' }),
    size: ab.byteLength,
    inputSize: file.size,
  };
}

export async function processImageCrop(
  file: File,
  opts: {
    x: number;
    y: number;
    w: number;
    h: number;
    mime?: string;
    quality?: number;
  }
): Promise<JobResult> {
  const bmp = await createImageBitmap(file);
  const w = Math.max(1, Math.min(opts.w, bmp.width));
  const h = Math.max(1, Math.min(opts.h, bmp.height));
  const x = Math.max(0, Math.min(opts.x, bmp.width - w));
  const y = Math.max(0, Math.min(opts.y, bmp.height - h));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bmp.close();
    throw new Error('Canvas unavailable');
  }
  ctx.drawImage(bmp, x, y, w, h, 0, 0, w, h);
  bmp.close();
  const mime = opts.mime || file.type || 'image/png';
  const blob = await canvas.convertToBlob({ type: mime, quality: opts.quality ?? 0.92 });
  return {
    name: `${baseName(file.name)}-crop.${mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png'}`,
    blob,
    size: blob.size,
    inputSize: file.size,
    note: `${w}×${h}`,
  };
}

export async function processPdfPageNumbers(
  file: File,
  opts: { format?: string; start?: number; position?: 'footer' | 'header' }
): Promise<JobResult> {
  const buffer = await file.arrayBuffer();
  const out = await addPageNumbers(buffer, opts);
  const ab = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
  return {
    name: `${baseName(file.name)}-numbered.pdf`,
    blob: new Blob([ab], { type: 'application/pdf' }),
    size: ab.byteLength,
    inputSize: file.size,
  };
}

export async function processPdfExtractText(file: File): Promise<JobResult> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((it) => ('str' in it ? it.str : '')).join(' ');
    parts.push(`--- page ${i} ---\n${text}`);
    page.cleanup();
  }
  const out = parts.join('\n\n');
  return {
    name: `${baseName(file.name)}.txt`,
    blob: new Blob([out], { type: 'text/plain;charset=utf-8' }),
    size: new Blob([out]).size,
    inputSize: file.size,
    note: `${doc.numPages} pages`,
  };
}

export async function processPdfToImages(file: File, scale = 1.5): Promise<JobResult[]> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const results: JobResult[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    if (!blob) continue;
    results.push({
      name: `${baseName(file.name)}-p${i}.png`,
      blob,
      size: blob.size,
      inputSize: file.size,
      note: `${canvas.width}×${canvas.height}`,
    });
  }
  return results;
}

/** Decode HEIC/HEIF to JPEG blob when needed; otherwise return original File. */
export async function ensureBrowserImage(file: File): Promise<File> {
  if (!/\.hei[cf]$/i.test(file.name) && !/hei[cf]/i.test(file.type || '')) return file;
  const heic2any = (await import('heic2any')).default;
  const buf = await file.arrayBuffer();
  const out = await heic2any({ blob: new Blob([buf]), toType: 'image/jpeg', quality: 0.92 });
  const blob = Array.isArray(out) ? out[0] : out;
  return new File([blob], file.name.replace(/\.hei[cf]$/i, '.jpg'), { type: 'image/jpeg' });
}

/** Binary-search quality (and optional maxEdge) to fit targetBytes. */
export async function processImageTargetSize(
  file: File,
  opts: {
    targetBytes: number;
    mime?: string;
    maxEdge?: number;
  }
): Promise<JobResult> {
  const decoded = await ensureBrowserImage(file);
  const mime = opts.mime || (decoded.type === 'image/png' ? 'image/png' : 'image/jpeg');
  let lo = 0.15;
  let hi = 0.95;
  let best: { buffer: ArrayBuffer; size: number; quality: number; width: number; height: number } | null =
    null;

  for (let i = 0; i < 7; i++) {
    const mid = (lo + hi) / 2;
    const buffer = await decoded.arrayBuffer();
    const { imagePool } = getPools();
    const result = await imagePool.run<{
      buffer: ArrayBuffer;
      size: number;
      width: number;
      height: number;
    }>(
      {
        id: `${Date.now()}-${Math.random()}`,
        type: 'compress',
        buffer,
        mime,
        quality: mid,
        maxEdge: opts.maxEdge || 0,
        filename: decoded.name,
      },
      [buffer]
    );
    if (!best || result.size < best.size) {
      best = { buffer: result.buffer, size: result.size, quality: mid, width: result.width, height: result.height };
    }
    if (result.size > opts.targetBytes) hi = mid;
    else lo = mid;
    if (result.size <= opts.targetBytes && result.size > opts.targetBytes * 0.85) break;
  }

  if (!best) throw new Error('压缩失败');
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  return {
    name: `${baseName(decoded.name)}-fit.${ext}`,
    blob: new Blob([best.buffer], { type: mime }),
    size: best.size,
    inputSize: file.size,
    note: `目标 ${formatBytes(opts.targetBytes)} · q≈${Math.round(best.quality * 100)}`,
  };
}

export async function processOcr(
  file: File,
  opts: { lang?: string } = {}
): Promise<JobResult> {
  const { createWorker } = await import('tesseract.js');
  const lang = opts.lang || 'eng';
  const worker = await createWorker(lang, 1, {
    logger: () => undefined,
  });
  try {
    let imageUrl: string;
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
      // first page only for MVP OCR on PDFs
      const pages = await processPdfToImages(file, 1.6);
      if (!pages.length) throw new Error('无法渲染 PDF');
      imageUrl = URL.createObjectURL(pages[0].blob);
    } else {
      imageUrl = URL.createObjectURL(file);
    }
    const { data } = await worker.recognize(imageUrl);
    URL.revokeObjectURL(imageUrl);
    const text = data.text || '';
    return {
      name: `${baseName(file.name)}-ocr.txt`,
      blob: new Blob([text], { type: 'text/plain;charset=utf-8' }),
      size: new Blob([text]).size,
      inputSize: file.size,
      note: `lang=${lang} · ${text.trim().length} 字符`,
    };
  } finally {
    await worker.terminate();
  }
}

export async function processPdfMerge(files: File[], outName: string): Promise<JobResult[]> {
  const payloads: { name: string; buffer: ArrayBuffer }[] = [];
  const transferred: ArrayBuffer[] = [];
  for (const file of files) {
    const buffer = await file.arrayBuffer();
    payloads.push({ name: file.name, buffer });
    transferred.push(buffer);
  }
  const result = await getPools().pdfPool.run<{ buffer: ArrayBuffer; size: number }>(
    { id: String(Date.now()), type: 'merge', payload: { files: payloads } },
    transferred
  );
  return [
    {
      name: /\.pdf$/i.test(outName) ? outName : `${outName}.pdf`,
      blob: new Blob([result.buffer], { type: 'application/pdf' }),
      size: result.size,
      inputSize: files.reduce((s, f) => s + f.size, 0),
      note: `${files.length} files`,
    },
  ];
}

export async function processImageToPdf(files: File[]): Promise<JobResult[]> {
  const pdf = await PDFDocument.create();
  const a4 = { width: 595.28, height: 841.89 };
  for (const file of files) {
    let bytes = new Uint8Array(await file.arrayBuffer());
    let isPng = file.type === 'image/png' || /\.png$/i.test(file.name);
    let isJpg = file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name);
    if (!isPng && !isJpg) {
      const buffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer;
      const converted = await getPools().imagePool.run<{ buffer: ArrayBuffer }>(
        {
          id: String(Math.random()),
          type: 'convert',
          buffer,
          mime: 'image/png',
          quality: 1,
          maxEdge: 0,
          filename: file.name,
        },
        [buffer]
      );
      bytes = new Uint8Array(converted.buffer);
      isPng = true;
      isJpg = false;
    }
    const image = isPng ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    const page = pdf.addPage([a4.width, a4.height]);
    const scale = Math.min((a4.width - 48) / image.width, (a4.height - 48) / image.height);
    const w = image.width * scale;
    const h = image.height * scale;
    page.drawImage(image, {
      x: (a4.width - w) / 2,
      y: (a4.height - h) / 2,
      width: w,
      height: h,
    });
    void isJpg;
  }
  const out = await pdf.save({ useObjectStreams: true });
  const ab = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
  return [
    {
      name: 'images.pdf',
      blob: new Blob([ab], { type: 'application/pdf' }),
      size: ab.byteLength,
      inputSize: files.reduce((s, f) => s + f.size, 0),
      note: `${files.length} pages`,
    },
  ];
}

export async function processAudio(file: File, options: AudioExportOptions): Promise<JobResult> {
  const buf = await file.arrayBuffer();
  const ctx = new AudioContext();
  try {
    const audio = await ctx.decodeAudioData(buf);
    const targetRate = options.sampleRate || audio.sampleRate;
    let source = audio;
    const targetChannels =
      options.channels === 'mono' ? 1 : options.channels === 'stereo' ? 2 : audio.numberOfChannels;

    if (targetRate !== audio.sampleRate || targetChannels !== audio.numberOfChannels) {
      const offline = new OfflineAudioContext(
        targetChannels,
        Math.ceil(audio.duration * targetRate),
        targetRate
      );
      const src = offline.createBufferSource();
      src.buffer = audio;
      if (targetChannels === 1) {
        const merger = offline.createChannelMerger(1);
        src.connect(merger);
        merger.connect(offline.destination);
      } else {
        src.connect(offline.destination);
      }
      src.start();
      source = await offline.startRendering();
    }

    const channels: Float32Array[] = [];
    for (let c = 0; c < source.numberOfChannels; c++) channels.push(source.getChannelData(c));

    if (options.format === 'mp3') {
      const mp3 = await encodeMp3(channels, source.sampleRate, options.mp3Kbps || 192);
      return {
        name: `${baseName(file.name)}.mp3`,
        blob: new Blob([mp3], { type: 'audio/mpeg' }),
        size: mp3.byteLength,
        inputSize: file.size,
        note: `${source.sampleRate}Hz · ${source.numberOfChannels}ch · ${options.mp3Kbps || 192}kbps`,
      };
    }

    if (options.format === 'flac') {
      const { encodeFlacFromChannels } = await import('@/engine/flac');
      const flac = await encodeFlacFromChannels(channels, source.sampleRate, {
        bps: options.bitDepth === 24 ? 24 : 16,
      });
      return {
        name: `${baseName(file.name)}.flac`,
        blob: new Blob([flac as unknown as BlobPart], { type: 'audio/flac' }),
        size: flac.byteLength,
        inputSize: file.size,
        note: `${source.sampleRate}Hz · ${source.numberOfChannels}ch · FLAC`,
      };
    }

    const wav = encodeWavFromChannels(channels, source.sampleRate, options.bitDepth || 16);
    return {
      name: `${baseName(file.name)}.wav`,
      blob: new Blob([wav], { type: 'audio/wav' }),
      size: wav.byteLength,
      inputSize: file.size,
      note: `${source.sampleRate}Hz · ${source.numberOfChannels}ch · ${options.bitDepth || 16}bit`,
    };
  } finally {
    void ctx.close();
  }
}

export async function processAudioTrim(
  file: File,
  opts: {
    startSec: number;
    endSec?: number;
    format: 'wav' | 'mp3' | 'flac';
    mp3Kbps?: number;
  }
): Promise<JobResult> {
  const buf = await file.arrayBuffer();
  const ctx = new AudioContext();
  try {
    const audio = await ctx.decodeAudioData(buf);
    const start = Math.max(0, opts.startSec || 0);
    const end = Math.min(audio.duration, opts.endSec != null ? opts.endSec : audio.duration);
    if (end <= start) throw new Error('结束时间必须大于开始时间');
    const rate = audio.sampleRate;
    const s0 = Math.floor(start * rate);
    const s1 = Math.floor(end * rate);
    const channels: Float32Array[] = [];
    for (let c = 0; c < audio.numberOfChannels; c++) {
      channels.push(audio.getChannelData(c).slice(s0, s1));
    }
    if (opts.format === 'mp3') {
      const mp3 = await encodeMp3(channels, rate, opts.mp3Kbps || 192);
      return {
        name: `${baseName(file.name)}-trim.mp3`,
        blob: new Blob([mp3], { type: 'audio/mpeg' }),
        size: mp3.byteLength,
        inputSize: file.size,
        note: `${start.toFixed(2)}s–${end.toFixed(2)}s`,
      };
    }
    if (opts.format === 'flac') {
      const { encodeFlacFromChannels } = await import('@/engine/flac');
      const flac = await encodeFlacFromChannels(channels, rate, { bps: 16 });
      return {
        name: `${baseName(file.name)}-trim.flac`,
        blob: new Blob([flac as unknown as BlobPart], { type: 'audio/flac' }),
        size: flac.byteLength,
        inputSize: file.size,
        note: `${start.toFixed(2)}s–${end.toFixed(2)}s`,
      };
    }
    const wav = encodeWavFromChannels(channels, rate, 16);
    return {
      name: `${baseName(file.name)}-trim.wav`,
      blob: new Blob([wav], { type: 'audio/wav' }),
      size: wav.byteLength,
      inputSize: file.size,
      note: `${start.toFixed(2)}s–${end.toFixed(2)}s`,
    };
  } finally {
    void ctx.close();
  }
}

export function pushUnique(results: JobResult[]): JobResult[] {
  const used = new Set<string>();
  return results.map((r) => ({ ...r, name: uniqueName(r.name, used) }));
}

export async function downloadAll(results: JobResult[], tag = 'toolbox') {
  if (!results.length) return;
  if (results.length === 1) {
    downloadBlob(results[0].blob, results[0].name);
    return;
  }
  const files = await Promise.all(
    results.map(async (r) => ({
      name: r.name,
      data: new Uint8Array(await r.blob.arrayBuffer()),
    }))
  );
  downloadBlob(createZip(files), `${tag}-${Date.now()}.zip`);
}

export { formatBytes, downloadBlob };
