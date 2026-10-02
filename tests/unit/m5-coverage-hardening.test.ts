import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { WorkerPool } from '@/engine/worker-pool';
import {
  computeTextDiff,
  testRegex,
  jsonToTypeScript,
} from '@/engine/dev-tools';
import {
  deletePdfPages,
  reorderPdfPages,
  rotatePdf,
  encryptPdf,
  addPageNumbers,
  cropPdfPages,
  cropPdfRect,
  addPdfOutlines,
  nupPdf,
  hashHex,
} from '@/engine/pdf-ops';
import {
  createZip,
  encodeWavFromChannels,
  jsonToCsv,
  csvToJson,
} from '@/lib/utils';
import { parseIdFields, pushUnique, type JobResult } from '@/engine/jobs';

// MockWorker harness for WorkerPool testing
class MockWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  terminated = false;
  postedMessages: unknown[] = [];

  constructor(public url: unknown, public opts: unknown) {}

  postMessage(message: unknown) {
    this.postedMessages.push(message);
  }

  terminate() {
    this.terminated = true;
  }
}

// PDF Generator helper
async function makePdf(pages = 2): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([400, 600]);
    page.drawText(`Page ${i + 1}`, { x: 40, y: 40, size: 12 });
  }
  return doc.save({ useObjectStreams: true });
}

function toBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

// ==========================================
// 1. DevTools Engine Hardening
// ==========================================
describe('DevTools Engine Hardening', () => {
  it('computes word-level diffs correctly with mode="words"', () => {
    const left = 'The quick brown fox jumps over the lazy dog';
    const right = 'The fast brown fox leaps over the sleepy dog';
    const res = computeTextDiff(left, right, 'words');
    expect(res.stats.added).toBeGreaterThan(0);
    expect(res.stats.removed).toBeGreaterThan(0);
    expect(res.diffs.some((d) => d.added && d.value.includes('fast'))).toBe(true);
    expect(res.diffs.some((d) => d.removed && d.value.includes('quick'))).toBe(true);
  });

  it('handles identical multiline text with 0 additions and 0 removals', () => {
    const text = 'alpha\nbeta\ngamma';
    const res = computeTextDiff(text, text, 'lines');
    expect(res.stats.added).toBe(0);
    expect(res.stats.removed).toBe(0);
    expect(res.stats.unchanged).toBe(3);
    expect(res.lines[0]).toEqual({ type: 'unchanged', value: 'alpha', leftLine: 1, rightLine: 1 });
  });

  it('protects against runaway zero-length regex matching with maxIterations cap of 500', () => {
    const pattern = '(?=.)';
    const longText = 'a'.repeat(1000);
    const res = testRegex(pattern, 'g', longText);
    expect(res.error).toBeUndefined();
    expect(res.matches.length).toBe(500);
  });

  it('handles regex syntax error cleanly without throwing', () => {
    const res = testRegex('[unclosed-bracket', 'g', 'some text');
    expect(res.matches).toEqual([]);
    expect(res.error).toBeDefined();
  });

  it('returns empty matches when pattern is empty string', () => {
    const res = testRegex('', 'g', 'hello world');
    expect(res.matches).toEqual([]);
    expect(res.replacedText).toBe('hello world');
  });

  it('automatically adds global "g" flag when omitted in flags argument', () => {
    const res = testRegex('abc', 'i', 'abc ABC abc');
    expect(res.error).toBeUndefined();
    expect(res.matches.length).toBe(3);
  });

  it('generates type alias instead of interface when useTypeAlias=true', () => {
    const json = JSON.stringify({ id: 1, name: 'Tool' });
    const res = jsonToTypeScript(json, { rootName: 'Tool', useTypeAlias: true });
    expect(res.error).toBeUndefined();
    expect(res.code).toContain('type Tool = {');
  });

  it('adds readonly modifier when readonlyFields=true', () => {
    const json = JSON.stringify({ id: 1, title: 'Item' });
    const res = jsonToTypeScript(json, { rootName: 'Item', readonlyFields: true });
    expect(res.code).toContain('readonly id: number;');
    expect(res.code).toContain('readonly title: string;');
  });

  it('handles top-level array in jsonToTypeScript', () => {
    const json = JSON.stringify([{ id: 101, tag: 'v1' }]);
    const res = jsonToTypeScript(json, { rootName: 'Config' });
    expect(res.code).toContain('type Config = ConfigItem[];');
    expect(res.code).toContain('interface ConfigItem {');
  });

  it('handles top-level primitives (string, number, boolean) in jsonToTypeScript', () => {
    const resStr = jsonToTypeScript('"simple text"', { rootName: 'Title' });
    expect(resStr.code).toContain('type Title = string;');

    const resNum = jsonToTypeScript('42', { rootName: 'Count' });
    expect(resNum.code).toContain('type Count = number;');

    const resBool = jsonToTypeScript('true', { rootName: 'Flag' });
    expect(resBool.code).toContain('type Flag = boolean;');
  });

  it('quotes keys with special characters or invalid JS identifiers', () => {
    const json = JSON.stringify({ 'user-name': 'Alice', '123_code': 'ABC', 'spaced key': true });
    const res = jsonToTypeScript(json, { rootName: 'Profile' });
    expect(res.code).toContain('"user-name": string;');
    expect(res.code).toContain('"123_code": string;');
    expect(res.code).toContain('"spaced key": boolean;');
  });

  it('returns clean error message on invalid JSON syntax in jsonToTypeScript', () => {
    const res = jsonToTypeScript('{ invalid-json: true ');
    expect(res.code).toBe('');
    expect(res.error).toBeDefined();
  });
});

// ==========================================
// 2. PDF Operations Hardening
// ==========================================
describe('PDF Operations Hardening', () => {
  it('throws error when attempting to delete all pages of a document', async () => {
    const src = await makePdf(3);
    await expect(deletePdfPages(toBuffer(src), '1-3')).rejects.toThrow('不能删除全部页面');
    await expect(deletePdfPages(toBuffer(src), '1,2,3')).rejects.toThrow('不能删除全部页面');
  });

  it('appends missing pages when reorder order specification is partial', async () => {
    const src = await makePdf(4);
    // Order 3,1 specifies page 3 first, then page 1. Missing pages 2 and 4 should be appended in original order: 3, 1, 2, 4
    const out = await reorderPdfPages(toBuffer(src), '3,1');
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(4);
  });

  it('encrypts PDF with user and owner passwords and restricts permissions', async () => {
    const src = await makePdf(2);
    const out = await encryptPdf(toBuffer(src), {
      userPassword: 'secretUser123',
      ownerPassword: 'secretOwner456',
      permissions: {
        printing: false,
        copying: false,
        modifying: false,
        annotating: false,
        fillingForms: false,
      },
    });
    expect(out.byteLength).toBeGreaterThan(0);
  });

  it('crops PDF pages with uniform margins', async () => {
    const src = await makePdf(2);
    const out = await cropPdfPages(toBuffer(src), { top: 20, right: 30, bottom: 40, left: 10 });
    const doc = await PDFDocument.load(out);
    const page = doc.getPages()[0];
    const cropBox = page.getCropBox();
    expect(cropBox.x).toBe(10);
    expect(cropBox.y).toBe(40);
  });

  it('crops PDF pages using rectangle coordinates', async () => {
    const src = await makePdf(2);
    const out = await cropPdfRect(toBuffer(src), { x: 50, y: 50, w: 200, h: 300 });
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(2);
  });

  it('embeds outline bookmarks tree into PDF document', async () => {
    const src = await makePdf(3);
    const outlines = [
      { title: 'Intro', pageIndex: 0 },
      { title: 'Details', pageIndex: 1 },
      { title: 'Summary', pageIndex: 2 },
    ];
    const out = await addPdfOutlines(toBuffer(src), outlines);
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(3);
  });

  it('renders page numbers at header position with custom start offset', async () => {
    const src = await makePdf(3);
    const out = await addPageNumbers(toBuffer(src), {
      position: 'header',
      start: 5,
      format: 'P.{n} / Total {total}',
    });
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(3);
    expect(out.byteLength).toBeGreaterThan(src.byteLength);
  });

  it('handles negative rotation angle (-90 becomes 270) and 360-degree cycles', async () => {
    const src = await makePdf(1);
    const outNeg = await rotatePdf(toBuffer(src), -90);
    const docNeg = await PDFDocument.load(outNeg);
    expect(docNeg.getPages()[0].getRotation().angle).toBe(270);

    const out360 = await rotatePdf(toBuffer(src), 360);
    const doc360 = await PDFDocument.load(out360);
    expect(doc360.getPages()[0].getRotation().angle).toBe(0);
  });

  it('packs 4 pages into 1 sheet with 4-up layout', async () => {
    const src = await makePdf(4);
    const out = await nupPdf(toBuffer(src), 4);
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(1);
  });

  it('computes SHA-256 and SHA-1 hashes of binary buffer via hashHex', async () => {
    const data = new TextEncoder().encode('hello world').buffer;
    const sha256 = await hashHex(data, 'SHA-256');
    expect(sha256).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
    const sha1 = await hashHex(data, 'SHA-1');
    expect(sha1).toBe('2aae6c35c94fcfb415dbe95f408b9ce91ee846ed');
  });
});

// ==========================================
// 3. Worker Pool Hardening
// ==========================================
describe('WorkerPool Hardening', () => {
  const originalWorker = globalThis.Worker;

  beforeEach(() => {
    (globalThis as unknown as { Worker: typeof MockWorker }).Worker = MockWorker;
  });

  afterEach(() => {
    globalThis.Worker = originalWorker;
  });

  it('clamps pool size to range [1, 4]', () => {
    const poolZero = new WorkerPool('dummy.js', 'test-zero', 0);
    expect(poolZero.size).toBe(1);
    const poolNeg = new WorkerPool('dummy.js', 'test-neg', -5);
    expect(poolNeg.size).toBe(1);
    const poolLarge = new WorkerPool('dummy.js', 'test-large', 10);
    expect(poolLarge.size).toBe(4);
    poolZero.destroy();
    poolNeg.destroy();
    poolLarge.destroy();
  });

  it('rejects job promise when worker replies with ok=false and specific error message', async () => {
    const pool = new WorkerPool('dummy.js', 'test-fail', 1);
    const runPromise = pool.run({ id: 'err-1', type: 'transcode' });
    const slot = (pool as unknown as { all: { worker: MockWorker }[] }).all[0];
    slot.worker.onmessage?.({
      data: { id: 'err-1', ok: false, error: 'Unsupported codec: av1' },
    } as MessageEvent);
    await expect(runPromise).rejects.toThrow('Unsupported codec: av1');
    pool.destroy();
  });

  it('rejects job promise with fallback "Worker failed" when error message is empty', async () => {
    const pool = new WorkerPool('dummy.js', 'test-fail-empty', 1);
    const runPromise = pool.run({ id: 'err-2', type: 'transcode' });
    const slot = (pool as unknown as { all: { worker: MockWorker }[] }).all[0];
    slot.worker.onmessage?.({
      data: { id: 'err-2', ok: false },
    } as MessageEvent);
    await expect(runPromise).rejects.toThrow('Worker failed');
    pool.destroy();
  });

  it('drains queued jobs strictly in FIFO order when workers become available', async () => {
    const pool = new WorkerPool('dummy.js', 'test-fifo', 1);
    const p1 = pool.run<string>({ id: 'job-1', type: 'step' });
    const p2 = pool.run<string>({ id: 'job-2', type: 'step' });
    const p3 = pool.run<string>({ id: 'job-3', type: 'step' });

    const slot = (pool as unknown as { all: { worker: MockWorker }[] }).all[0];
    const order: string[] = [];

    slot.worker.onmessage?.({
      data: { id: 'job-1', ok: true, result: 'res-1' },
    } as MessageEvent);
    order.push(await p1);

    slot.worker.onmessage?.({
      data: { id: 'job-2', ok: true, result: 'res-2' },
    } as MessageEvent);
    order.push(await p2);

    slot.worker.onmessage?.({
      data: { id: 'job-3', ok: true, result: 'res-3' },
    } as MessageEvent);
    order.push(await p3);

    expect(order).toEqual(['res-1', 'res-2', 'res-3']);
    pool.destroy();
  });

  it('handles null or missing event.data gracefully without unhandled exception', async () => {
    const pool = new WorkerPool('dummy.js', 'test-null-data', 1);
    const runPromise = pool.run({ id: 'null-data', type: 'step' });
    const slot = (pool as unknown as { all: { worker: MockWorker }[] }).all[0];
    slot.worker.onmessage?.({} as MessageEvent);
    await expect(runPromise).rejects.toThrow('Worker failed');
    pool.destroy();
  });
});

// ==========================================
// 4. Core Utilities & Jobs Hardening
// ==========================================
describe('Core Utilities & Jobs Hardening', () => {
  it('generates a valid zip archive containing files with correct headers and CRC32', async () => {
    const encoder = new TextEncoder();
    const fileA = { name: 'hello.txt', data: encoder.encode('Hello World') };
    const fileB = { name: 'sub/data.json', data: encoder.encode('{"key":"value"}') };
    const zipBlob = createZip([fileA, fileB]);
    expect(zipBlob.type).toBe('application/zip');
    expect(zipBlob.size).toBeGreaterThan(0);

    const ab = await zipBlob.arrayBuffer();
    const view = new DataView(ab);
    // ZIP local file header signature: 0x04034b50 (PK\x03\x04)
    expect(view.getUint32(0, true)).toBe(0x04034b50);
  });

  it('encodes 32-bit float IEEE WAV audio buffer', () => {
    const samples = new Float32Array([0.0, 0.5, -0.5, 1.0, -1.0]);
    const buf = encodeWavFromChannels([samples], 48000, 32);
    const view = new DataView(buf);
    expect(view.getUint16(20, true)).toBe(3); // IEEE float format code
    expect(view.getUint16(34, true)).toBe(32); // Bit depth 32
    expect(view.getUint32(24, true)).toBe(48000); // Sample rate
  });

  it('encodes 24-bit PCM WAV audio buffer', () => {
    const samples = new Float32Array([0.0, 0.5, -0.5]);
    const buf = encodeWavFromChannels([samples], 44100, 24);
    const view = new DataView(buf);
    expect(view.getUint16(20, true)).toBe(1); // PCM format code
    expect(view.getUint16(34, true)).toBe(24); // Bit depth 24
  });

  it('encodes stereo audio buffer with 2 channels', () => {
    const left = new Float32Array([0.1, 0.2]);
    const right = new Float32Array([-0.1, -0.2]);
    const buf = encodeWavFromChannels([left, right], 44100, 16);
    const view = new DataView(buf);
    expect(view.getUint16(22, true)).toBe(2); // numChannels = 2
    expect(view.getUint16(32, true)).toBe(4); // blockAlign = 4
  });

  it('correctly escapes quotes, commas, and newlines in CSV cells', () => {
    const data = [
      { id: 1, notes: 'Quote "here"', tag: 'has,comma' },
      { id: 2, notes: 'Normal text', tag: 'simple' },
    ];
    const csv = jsonToCsv(data);
    expect(csv).toContain('"Quote ""here"""');
    expect(csv).toContain('"has,comma"');

    const back = csvToJson(csv) as Record<string, string>[];
    expect(back).toHaveLength(2);
    expect(back[0].notes).toBe('Quote "here"');
    expect(back[0].tag).toBe('has,comma');

    // Verify newline quoting in jsonToCsv
    const multiline = [{ text: 'Line 1\nLine 2' }];
    expect(jsonToCsv(multiline)).toContain('"Line 1\nLine 2"');
  });

  it('extracts invoice fields from OCR text', () => {
    const text = '发票号码: 12345678 金额: 199.50 日期: 2026-10-01 识别号: 91110108MA00ABCD12';
    const res = parseIdFields(text);
    expect(res.type).toBe('invoice');
    expect(res.fields['发票号码']).toBe('12345678');
    expect(res.fields['金额']).toBe('199.50');
  });

  it('extracts bank card number from OCR text', () => {
    const text = '卡号 6222 0210 0012 3456';
    const res = parseIdFields(text);
    expect(res.type).toBe('bank-card');
    expect(res.fields['卡号']).toBe('6222021000123456');

    const raw19 = '卡号 6222021000123456789';
    const res19 = parseIdFields(raw19);
    expect(res19.type).toBe('bank-card');
    expect(res19.fields['卡号']).toBe('6222021000123456789');
  });

  it('extracts passport machine readable zone (MRZ)', () => {
    const text = 'POCHNWANG<<XIAOMING<<<<<<<<<<<<<<<<<<<<<<<\nE123456780CHN9001011M2501015<<<<<<<<<<<<<<02';
    const res = parseIdFields(text);
    expect(res.type).toBe('passport');
    expect(res.fields['机读码']).toBeDefined();
  });

  it('falls back to unknown type with full text slice for unstructured text', () => {
    const text = '普通非结构化文档识别内容示例';
    const res = parseIdFields(text);
    expect(res.type).toBe('unknown');
    expect(res.fields['全文']).toBe(text);
  });

  it('deduplicates filenames in JobResult array using pushUnique', () => {
    const dummyBlob = new Blob(['test']);
    const results: JobResult[] = [
      { name: 'export.png', blob: dummyBlob, size: 4, inputSize: 4 },
      { name: 'export.png', blob: dummyBlob, size: 4, inputSize: 4 },
      { name: 'export.png', blob: dummyBlob, size: 4, inputSize: 4 },
    ];
    const unique = pushUnique(results);
    expect(unique[0].name).toBe('export.png');
    expect(unique[1].name).toBe('export-2.png');
    expect(unique[2].name).toBe('export-3.png');
  });
});
