import { describe, it, expect } from 'vitest';
import { PDFDocument, degrees, StandardFonts } from 'pdf-lib';
import {
  rotatePdf,
  splitPdf,
  mergePdfs,
  watermarkPdfText,
  parsePageRange,
  deletePdfPages,
  addPageNumbers,
  formatBase64,
  nupPdf,
  reorderPdfPages,
} from '@/engine/pdf-ops';

async function makePdf(pages = 2) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([400, 600]);
    page.drawText(`Page ${i + 1}`, { x: 40, y: 40, size: 12, font });
    page.setRotation(degrees(0));
  }
  return doc.save({ useObjectStreams: true });
}

function toBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

describe('pdf-ops', () => {
  it('rotates every page by 90', async () => {
    const src = await makePdf(2);
    const out = await rotatePdf(toBuffer(src), 90);
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(2);
    for (const page of doc.getPages()) {
      expect(page.getRotation().angle).toBe(90);
    }
  });

  it('accumulates rotation', async () => {
    const src = await makePdf(1);
    const once = await rotatePdf(toBuffer(src), 90);
    const twice = await rotatePdf(toBuffer(once), 90);
    const doc = await PDFDocument.load(twice);
    expect(doc.getPages()[0].getRotation().angle).toBe(180);
  });

  it('splits page range', async () => {
    const src = await makePdf(5);
    const out = await splitPdf(toBuffer(src), '1-2,4');
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(3);
  });

  it('merges docs', async () => {
    const a = await makePdf(1);
    const b = await makePdf(2);
    const out = await mergePdfs([toBuffer(a), toBuffer(b)]);
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(3);
  });

  it('watermark text draws without throw for ASCII', async () => {
    const src = await makePdf(1);
    const out = await watermarkPdfText(toBuffer(src), 'CONFIDENTIAL', { opacity: 0.2, size: 36 });
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(1);
    expect(out.length).toBeGreaterThan(src.length);
  });

  it('parsePageRange helper', () => {
    expect(parsePageRange('1-2', 3)).toEqual([0, 1]);
  });

  it('deletes selected pages', async () => {
    const src = await makePdf(5);
    const out = await deletePdfPages(toBuffer(src), '2,4');
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(3);
  });

  it('adds page numbers', async () => {
    const src = await makePdf(2);
    const out = await addPageNumbers(toBuffer(src), { start: 1, format: '{n}/{total}' });
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(2);
    expect(out.length).toBeGreaterThan(src.length);
  });

  it('base64 roundtrip', () => {
    const s = '你好 world';
    expect(formatBase64(formatBase64(s, 'encode'), 'decode')).toBe(s);
  });

  it('reorders pages', async () => {
    const src = await makePdf(3);
    const out = await reorderPdfPages(toBuffer(src), '3,1,2');
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(3);
  });

  it('n-up 2 pages into one sheet', async () => {
    const src = await makePdf(4);
    const out = await nupPdf(toBuffer(src), 2);
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(2);
  });
});
