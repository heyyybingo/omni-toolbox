/* PDF worker: pdf-lib in a classic worker so heavy page ops stay off the UI thread. */

const PDFLIB_URL = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';

importScripts(PDFLIB_URL);

const { PDFDocument, StandardFonts, rgb, degrees } = PDFLib;

function parsePageRange(rangeStr, pageCount) {
  const text = (rangeStr || '').trim();
  if (!text) {
    return Array.from({ length: pageCount }, (_, i) => i);
  }
  const pages = new Set();
  for (const part of text.split(',')) {
    const piece = part.trim();
    if (!piece) continue;
    if (piece.includes('-')) {
      const [a, b] = piece.split('-').map((x) => parseInt(x.trim(), 10));
      const start = Math.min(a, b);
      const end = Math.max(a, b);
      for (let p = start; p <= end; p++) {
        if (p >= 1 && p <= pageCount) pages.add(p - 1);
      }
    } else {
      const p = parseInt(piece, 10);
      if (p >= 1 && p <= pageCount) pages.add(p - 1);
    }
  }
  if (!pages.size) throw new Error('页码范围无效');
  return [...pages].sort((a, b) => a - b);
}

self.onmessage = async (event) => {
  const { id, type, payload } = event.data || {};
  try {
    let outBuffer;

    if (type === 'merge') {
      const docs = payload.files.map((f) => f.buffer);
      const out = await PDFDocument.create();
      for (const buf of docs) {
        const src = await PDFDocument.load(buf, { ignoreEncryption: true });
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach((p) => out.addPage(p));
      }
      outBuffer = await out.save({ useObjectStreams: true });
    } else if (type === 'split') {
      const src = await PDFDocument.load(payload.buffer, { ignoreEncryption: true });
      const indices = parsePageRange(payload.range, src.getPageCount());
      const out = await PDFDocument.create();
      const pages = await out.copyPages(src, indices);
      pages.forEach((p) => out.addPage(p));
      outBuffer = await out.save({ useObjectStreams: true });
    } else if (type === 'rotate') {
      const src = await PDFDocument.load(payload.buffer, { ignoreEncryption: true });
      const angle = degrees(((payload.angle || 0) % 360 + 360) % 360);
      const pages = src.getPages();
      for (const page of pages) {
        const current = page.getRotation().angle || 0;
        page.setRotation(degrees((current + (payload.angle || 0)) % 360));
      }
      // keep as number for types; angle used above
      void angle;
      outBuffer = await src.save({ useObjectStreams: true });
    } else if (type === 'watermark') {
      const src = await PDFDocument.load(payload.buffer, { ignoreEncryption: true });
      const font = await src.embedFont(StandardFonts.HelveticaBold);
      const pages = src.getPages();
      const opacity = payload.opacity ?? 0.18;
      const size = payload.size || 42;
      const angle = payload.angle ?? 32;
      for (const page of pages) {
        const { width, height } = page.getSize();
        const text = payload.text || 'WATERMARK';
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
      outBuffer = await src.save({ useObjectStreams: true });
    } else {
      throw new Error(`Unknown pdf job: ${type}`);
    }

    const ab = outBuffer.buffer.slice(
      outBuffer.byteOffset,
      outBuffer.byteOffset + outBuffer.byteLength
    );
    self.postMessage({ id, ok: true, result: { buffer: ab, size: ab.byteLength } }, [ab]);
  } catch (err) {
    self.postMessage({
      id,
      ok: false,
      error: err && err.message ? err.message : String(err),
    });
  }
};
