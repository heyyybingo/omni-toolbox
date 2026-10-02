import { PDFDocument, degrees, StandardFonts, rgb } from 'pdf-lib';

import { parsePageRange } from '@/lib/utils';
export { parsePageRange };

export async function deletePdfPages(buffer: ArrayBuffer, range: string): Promise<Uint8Array> {
  const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const pageCount = src.getPageCount();
  const remove = new Set(parsePageRange(range, pageCount));
  if (remove.size === pageCount) throw new Error('不能删除全部页面');
  const out = await PDFDocument.create();
  const keep: number[] = [];
  for (let i = 0; i < pageCount; i++) if (!remove.has(i)) keep.push(i);
  const pages = await out.copyPages(src, keep);
  pages.forEach((p) => out.addPage(p));
  return out.save({ useObjectStreams: true });
}

/** Reorder pages by 1-based order list, e.g. "3,1,2". Missing pages appended. */
export async function reorderPdfPages(buffer: ArrayBuffer, order: string): Promise<Uint8Array> {
  const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const pageCount = src.getPageCount();
  const parsed = parsePageRange(order, pageCount);
  const seen = new Set(parsed);
  for (let i = 0; i < pageCount; i++) if (!seen.has(i)) parsed.push(i);
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, parsed);
  pages.forEach((p) => out.addPage(p));
  return out.save({ useObjectStreams: true });
}

/** N-up: pack `n` source pages per sheet (2 or 4). */
export async function nupPdf(buffer: ArrayBuffer, n: 2 | 4): Promise<Uint8Array> {
  const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const indices = src.getPageIndices();
  const first = src.getPage(0);
  const { width: pw, height: ph } = first.getSize();
  const cols = 2;
  const rows = n === 2 ? 1 : 2;
  const cellW = pw / cols;
  const cellH = ph / rows;

  for (let i = 0; i < indices.length; i += n) {
    const sheet = out.addPage([pw, ph]);
    for (let j = 0; j < n && i + j < indices.length; j++) {
      const [embedded] = await out.embedPdf(src, [indices[i + j]]);
      const col = j % cols;
      const row = Math.floor(j / cols);
      sheet.drawPage(embedded, {
        x: col * cellW,
        y: ph - (row + 1) * cellH,
        xScale: cellW / embedded.width,
        yScale: cellH / embedded.height,
      });
    }
  }
  return out.save({ useObjectStreams: true });
}

/** Crop all pages to a uniform margin box (points). */
export async function cropPdfPages(
  buffer: ArrayBuffer,
  margins: { top: number; right: number; bottom: number; left: number }
): Promise<Uint8Array> {
  const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
  for (const page of src.getPages()) {
    const { width, height } = page.getSize();
    page.setCropBox(
      margins.left,
      margins.bottom,
      Math.max(10, width - margins.left - margins.right),
      Math.max(10, height - margins.top - margins.bottom)
    );
  }
  return src.save({ useObjectStreams: true });
}

/** Crop all pages using a rect (PDF points on page 1 size); repeated on every page. */
export async function cropPdfRect(
  buffer: ArrayBuffer,
  rect: { x: number; y: number; w: number; h: number }
): Promise<Uint8Array> {
  const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const first = src.getPage(0);
  const { width, height } = first.getSize();
  const margins = {
    top: Math.max(0, height - rect.y - rect.h),
    right: Math.max(0, width - rect.x - rect.w),
    bottom: Math.max(0, rect.y),
    left: Math.max(0, rect.x),
  };
  return cropPdfPages(buffer, margins);
}

export async function addPageNumbers(
  buffer: ArrayBuffer,
  opts: { format?: string; start?: number; position?: 'footer' | 'header' } = {}
): Promise<Uint8Array> {
  const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const font = await src.embedFont(StandardFonts.Helvetica);
  const start = opts.start ?? 1;
  const format = opts.format || '{n} / {total}';
  const position = opts.position || 'footer';
  const total = src.getPageCount();
  const pages = src.getPages();
  pages.forEach((page, i) => {
    const { width } = page.getSize();
    const text = format.replace('{n}', String(start + i)).replace('{total}', String(start + total - 1));
    const textWidth = font.widthOfTextAtSize(text, 10);
    page.drawText(text, {
      x: (width - textWidth) / 2,
      y: position === 'header' ? page.getSize().height - 28 : 18,
      size: 10,
      font,
      color: rgb(0.35, 0.35, 0.4),
    });
  });
  return src.save({ useObjectStreams: true });
}

export async function extractPdfText(buffer: ArrayBuffer): Promise<string[]> {
  // lightweight: empty array placeholder — real text via pdf.js at UI layer
  void buffer;
  return [];
}

export function formatBase64(text: string, mode: 'encode' | 'decode'): string {
  if (mode === 'encode') {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  }
  const bin = atob(text.replace(/\s+/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function hashHex(buf: ArrayBuffer, algorithm: 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'): Promise<string> {
  return crypto.subtle.digest(algorithm, buf).then((d) =>
    [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
  );
}

export function makeUuid(): string {
  return crypto.randomUUID();
}

export async function mergePdfs(files: ArrayBuffer[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const buffer of files) {
    const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  return out.save({ useObjectStreams: true });
}

export async function splitPdf(buffer: ArrayBuffer, range: string): Promise<Uint8Array> {
  const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const indices = parsePageRange(range, src.getPageCount());
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, indices);
  pages.forEach((p) => out.addPage(p));
  return out.save({ useObjectStreams: true });
}

export async function rotatePdf(buffer: ArrayBuffer, angle: number): Promise<Uint8Array> {
  const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const delta = ((angle % 360) + 360) % 360;
  for (const page of src.getPages()) {
    const current = page.getRotation().angle || 0;
    page.setRotation(degrees(((current + delta) % 360 + 360) % 360));
  }
  return src.save({ useObjectStreams: true });
}

/** ASCII watermark via built-in font (fallback). */
export async function watermarkPdfText(
  buffer: ArrayBuffer,
  text: string,
  opts: { size?: number; opacity?: number; angle?: number } = {}
): Promise<Uint8Array> {
  const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const font = await src.embedFont(StandardFonts.HelveticaBold);
  const opacity = opts.opacity ?? 0.18;
  const size = opts.size || 42;
  const angle = opts.angle ?? 32;
  for (const page of src.getPages()) {
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(text, size);
    page.drawText(text, {
      x: (width - textWidth) / 2,
      y: height / 2,
      size,
      font,
      color: rgb(0.2, 0.25, 0.35),
      opacity,
      rotate: degrees(angle),
    });
  }
  return src.save({ useObjectStreams: true });
}

export type WatermarkStyle = {
  text: string;
  size?: number;
  opacity?: number;
  angle?: number;
  /** #rrggbb */
  color?: string;
  bold?: boolean;
  /** single centered stamp vs tiled grid */
  mode?: 'single' | 'tile';
  /** gap between tiles in px (tile mode) */
  gapX?: number;
  gapY?: number;
};

export function renderWatermarkPng(
  text: string,
  opts: { size?: number; angle?: number; color?: string; bold?: boolean } = {}
): Promise<Uint8Array> {
  const size = opts.size || 42;
  const angle = opts.angle ?? 32;
  const color = opts.color || '#333a48';
  const bold = opts.bold !== false;
  const width = 720;
  const height = 180;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('OffscreenCanvas 2D unavailable'));
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.fillStyle = color;
  ctx.font = `${bold ? 'bold ' : ''}${size}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 0, width - 48);
  ctx.restore();
  return canvas.convertToBlob({ type: 'image/png' }).then(async (blob) => {
    const ab = await blob.arrayBuffer();
    return new Uint8Array(ab);
  });
}

export async function watermarkPdfBitmap(
  buffer: ArrayBuffer,
  text: string,
  opts: {
    size?: number;
    opacity?: number;
    angle?: number;
    imageBytes?: Uint8Array;
    scale?: number;
    mode?: 'single' | 'tile';
    pos?: 'center' | 'tl' | 'tr' | 'bl' | 'br';
    gapX?: number;
    gapY?: number;
  } = {}
): Promise<Uint8Array> {
  const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const opacity = opts.opacity ?? 0.18;
  const angle = opts.angle ?? 32;
  const mode = opts.mode || 'single';

  let pngBytes = opts.imageBytes;
  if (!pngBytes) {
    return watermarkPdfText(buffer, text, opts);
  }

  const image = await src.embedPng(pngBytes);
  for (const page of src.getPages()) {
    const { width, height } = page.getSize();
    const scale = opts.scale
      ? Math.min(opts.scale, 1)
      : Math.min((width * 0.55) / image.width, (height * 0.28) / image.height, 1);
    const w = width * scale;
    const h = (image.height / image.width) * w;

    if (mode === 'tile') {
      const gapX = opts.gapX ?? w * 1.15;
      const gapY = opts.gapY ?? h * 1.8;
      const cols = Math.ceil(width / gapX) + 1;
      const rows = Math.ceil(height / gapY) + 1;
      const startX = (width - (cols - 1) * gapX) / 2;
      const startY = (height - (rows - 1) * gapY) / 2;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          page.drawImage(image, {
            x: startX + c * gapX - w / 2,
            y: startY + r * gapY - h / 2,
            width: w,
            height: h,
            opacity,
            rotate: degrees(angle),
          });
        }
      }
    } else {
      const pos = opts.pos || 'center';
      const x =
        pos === 'tl' ? w / 2 + 24 : pos === 'tr' ? width - w / 2 - 24 : (width - w) / 2 + w / 2;
      const y =
        pos === 'tl' || pos === 'tr' ? h / 2 + 24 : pos === 'bl' || pos === 'br' ? height - h / 2 - 24 : height / 2;
      page.drawImage(image, {
        x: x - w / 2,
        y: y - h / 2,
        width: w,
        height: h,
        opacity,
        rotate: degrees(angle),
      });
    }
  }
  return src.save({ useObjectStreams: true });
}

/** Encrypt PDF with user/owner password and permission flags. */
export async function encryptPdf(
  buffer: ArrayBuffer,
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
): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib-plus-encrypt');
  const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const userPassword = opts.userPassword || '';
  const ownerPassword = opts.ownerPassword || opts.userPassword || 'owner';
  if (!userPassword && !ownerPassword) {
    throw new Error('请设置打开密码或权限密码');
  }
  const p = opts.permissions || {};
  await src.encrypt({
    userPassword,
    ownerPassword,
    permissions: {
      printing: p.printing !== false,
      modifying: p.modifying === true,
      copying: p.copying !== false,
      annotating: p.annotating !== false,
      fillingForms: p.fillingForms !== false,
      contentAccessibility: p.accessibility !== false,
      documentAssembly: p.assembling === true,
    },
  });
  return src.save({ useObjectStreams: true });
}
/** Add real PDF outline (bookmark) tree to catalog. */
export async function addPdfOutlines(
  buffer: ArrayBuffer,
  items: { title: string; pageIndex: number }[]
): Promise<Uint8Array> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod: any = await import('pdf-lib');
  const { PDFDocument, PDFName, PDFString, PDFNumber } = mod;
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true, updateMetadata: false });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const context: any = doc.context;
  const pageCount = doc.getPageCount();
  const pages = doc.getPages();
  const count = Math.min(items.length, 50);

  const outlineRef = context.register(context.obj({ Type: 'Outlines' }));
  const itemRefs: unknown[] = [];
  for (let i = 0; i < count; i++) {
    const it = items[i];
    const pageIndex = Math.min(Math.max(0, it.pageIndex || 0), pageCount - 1);
    const dest = context.obj([pages[pageIndex].ref, 'Fit']);
    const item = context.obj({
      Title: PDFString.of(it.title || `Page ${pageIndex + 1}`),
      Parent: outlineRef,
      Dest: dest,
    });
    itemRefs.push(context.register(item));
  }
  for (let i = 0; i < itemRefs.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const item = context.lookup(itemRefs[i]) as any;
    if (i > 0) item.set(PDFName.of('Prev'), itemRefs[i - 1]);
    if (i < itemRefs.length - 1) item.set(PDFName.of('Next'), itemRefs[i + 1]);
    item.set(PDFName.of('Title'), PDFString.of(items[i].title || `Page ${i + 1}`));
  }
  if (itemRefs.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outline = context.lookup(outlineRef) as any;
    outline.set(PDFName.of('First'), itemRefs[0]);
    outline.set(PDFName.of('Last'), itemRefs[itemRefs.length - 1]);
    outline.set(PDFName.of('Count'), PDFNumber.of(itemRefs.length));
  }
  doc.catalog.set(PDFName.of('Outlines'), outlineRef);
  doc.catalog.set(PDFName.of('PageMode'), context.obj('UseOutlines'));
  return doc.save({ useObjectStreams: true });
}
