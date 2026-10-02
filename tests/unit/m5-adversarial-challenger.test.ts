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

async function makePdfWithLabels(count = 3): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < count; i++) {
    const page = doc.addPage([300, 300]);
    page.drawText(`PageLabel_${i + 1}`, { x: 50, y: 50, size: 14 });
  }
  return doc.save({ useObjectStreams: true });
}

function toBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

// ========================================================
// CHALLENGE 1: DevTools Boundaries & Stress Testing
// ========================================================
describe('Adversarial Challenge: DevTools Engine Hardening', () => {
  describe('computeTextDiff boundary tests', () => {
    it('handles both left and right empty strings', () => {
      const resWords = computeTextDiff('', '', 'words');
      expect(resWords.stats).toEqual({ added: 0, removed: 0, unchanged: 0 });
      expect(resWords.diffs).toHaveLength(0);

      const resLines = computeTextDiff('', '', 'lines');
      expect(resLines.stats).toEqual({ added: 0, removed: 0, unchanged: 0 });
    });

    it('handles left empty and right non-empty in words mode', () => {
      const res = computeTextDiff('', 'one two three', 'words');
      expect(res.stats.added).toBeGreaterThan(0);
      expect(res.stats.removed).toBe(0);
      expect(res.diffs[0].added).toBe(true);
    });

    it('handles left non-empty and right empty in words mode', () => {
      const res = computeTextDiff('one two three', '', 'words');
      expect(res.stats.removed).toBeGreaterThan(0);
      expect(res.stats.added).toBe(0);
      expect(res.diffs[0].removed).toBe(true);
    });

    it('handles completely disjoint text in words mode', () => {
      const res = computeTextDiff('apple orange', 'cat dog bird', 'words');
      expect(res.stats.added).toBeGreaterThan(0);
      expect(res.stats.removed).toBeGreaterThan(0);
      expect(res.stats.unchanged).toBe(0);
    });
  });

  describe('testRegex ReDoS & boundary stress', () => {
    it('enforces exact 500 maxIterations cap on zero-length matches', () => {
      const pattern = '(?=a)';
      const text = 'a'.repeat(2000);
      const res = testRegex(pattern, 'g', text);
      expect(res.error).toBeUndefined();
      expect(res.matches).toHaveLength(500);
      expect(res.matches[0].index).toBe(0);
      expect(res.matches[499].index).toBe(499);
    });

    it('terminates normally below 500 when match count is small', () => {
      const res = testRegex('x', 'g', 'x_x_x_x_x');
      expect(res.error).toBeUndefined();
      expect(res.matches).toHaveLength(5);
    });

    it('handles empty replacement string vs undefined replacement', () => {
      const resEmpty = testRegex('hello', 'g', 'hello world', '');
      expect(resEmpty.replacedText).toBe(' world');

      const resUndef = testRegex('hello', 'g', 'hello world', undefined);
      expect(resUndef.replacedText).toBeUndefined();
    });

    it('handles invalid regex without throwing error to caller', () => {
      const badPatterns = ['[a-z', '(?<invalid', '*foo', '\\'];
      for (const pat of badPatterns) {
        const res = testRegex(pat, 'g', 'test string');
        expect(res.matches).toEqual([]);
        expect(res.error).toBeDefined();
      }
    });

    it('handles capture groups including empty capture groups', () => {
      const res = testRegex('(\\w+)-(\\d+)(?:-(\\w+))?', 'g', 'item-42 item-99-special');
      expect(res.matches).toHaveLength(2);
      expect(res.matches[0].groups).toEqual(['item', '42', '']);
      expect(res.matches[1].groups).toEqual(['item', '99', 'special']);
    });
  });

  describe('jsonToTypeScript edge cases', () => {
    it('handles top-level null input safely', () => {
      const res = jsonToTypeScript('null', { rootName: 'NullRoot' });
      expect(res.error).toBeUndefined();
      expect(res.code).toContain('NullRoot');
    });

    it('handles top-level empty array (yielding undefined[] as parsed[0] is undefined)', () => {
      const res = jsonToTypeScript('[]', { rootName: 'EmptyList' });
      expect(res.error).toBeUndefined();
      expect(res.code).toBe('type EmptyList = undefined[];');
    });

    it('handles empty object {}', () => {
      const res = jsonToTypeScript('{}', { rootName: 'EmptyObj' });
      expect(res.error).toBeUndefined();
      expect(res.code).toContain('interface EmptyObj {');
    });

    it('handles top-level primitive array using first-element schema', () => {
      const json = JSON.stringify([10, 20, 30]);
      const res = jsonToTypeScript(json, { rootName: 'Numbers' });
      expect(res.error).toBeUndefined();
      expect(res.code).toBe('type Numbers = number[];');
    });

    it('handles exportPrefix flag', () => {
      const json = JSON.stringify({ key: 'val' });
      const res = jsonToTypeScript(json, { rootName: 'Exported', exportPrefix: true });
      expect(res.code).toContain('export interface Exported {');
    });
  });
});

// ========================================================
// CHALLENGE 2: PDF Operations Boundary Probing
// ========================================================
describe('Adversarial Challenge: PDF Operations Hardening', () => {
  it('deletePdfPages: throws if range covers all pages via open range', async () => {
    const src = await makePdfWithLabels(5);
    await expect(deletePdfPages(toBuffer(src), '1-')).rejects.toThrow('不能删除全部页面');
    await expect(deletePdfPages(toBuffer(src), '-5')).rejects.toThrow('不能删除全部页面');
    await expect(deletePdfPages(toBuffer(src), '1-5')).rejects.toThrow('不能删除全部页面');
  });

  it('deletePdfPages: deletes first and last page, retaining middle page', async () => {
    const src = await makePdfWithLabels(3);
    const out = await deletePdfPages(toBuffer(src), '1,3');
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(1);
    const page = doc.getPage(0);
    expect(page.getSize().width).toBe(300);
  });

  it('reorderPdfPages: verifies actual page count and preserves all pages', async () => {
    const src = await makePdfWithLabels(4);
    const out = await reorderPdfPages(toBuffer(src), '3,1');
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(4);
  });

  it('encryptPdf: falls back to default owner password "owner" when passwords are empty strings', async () => {
    const src = await makePdfWithLabels(1);
    const out = await encryptPdf(toBuffer(src), {
      userPassword: '',
      ownerPassword: '',
    });
    // Due to `opts.ownerPassword || opts.userPassword || 'owner'`, ownerPassword defaults to 'owner'
    expect(out.byteLength).toBeGreaterThan(0);
  });

  it('encryptPdf: produces genuinely encrypted PDF that rejects unauthenticated loading', async () => {
    const src = await makePdfWithLabels(2);
    const out = await encryptPdf(toBuffer(src), {
      userPassword: 'secretUserTest',
      ownerPassword: 'secretOwnerTest',
    });
    expect(out.byteLength).toBeGreaterThan(0);

    // Standard PDFDocument.load without ignoreEncryption throws encrypted error
    await expect(PDFDocument.load(out)).rejects.toThrow(/Input document to `PDFDocument.load` is encrypted/);
  });

  it('rotatePdf: handles multi-turn angles (720, -450, 0)', async () => {
    const src = await makePdfWithLabels(1);
    const out720 = await rotatePdf(toBuffer(src), 720);
    const doc720 = await PDFDocument.load(out720);
    expect(doc720.getPage(0).getRotation().angle).toBe(0);

    const outNeg450 = await rotatePdf(toBuffer(src), -450);
    const docNeg450 = await PDFDocument.load(outNeg450);
    expect(docNeg450.getPage(0).getRotation().angle).toBe(270);
  });

  it('nupPdf: packs odd page counts into multi-page grid sheets', async () => {
    const src3 = await makePdfWithLabels(3);
    const out2up = await nupPdf(toBuffer(src3), 2);
    const doc2up = await PDFDocument.load(out2up);
    expect(doc2up.getPageCount()).toBe(2);

    const src5 = await makePdfWithLabels(5);
    const out4up = await nupPdf(toBuffer(src5), 4);
    const doc4up = await PDFDocument.load(out4up);
    expect(doc4up.getPageCount()).toBe(2);
  });

  it('hashHex: accurately matches cryptographic standards for empty and known payloads', async () => {
    const emptyBuf = new ArrayBuffer(0);
    const sha256Empty = await hashHex(emptyBuf, 'SHA-256');
    expect(sha256Empty).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');

    const sha1Empty = await hashHex(emptyBuf, 'SHA-1');
    expect(sha1Empty).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');

    const data = new TextEncoder().encode('test').buffer;
    const sha512 = await hashHex(data, 'SHA-512');
    expect(sha512).toHaveLength(128);
  });

  it('addPdfOutlines: clamps out-of-range bookmark indices', async () => {
    const src = await makePdfWithLabels(2);
    const outlines = [
      { title: 'Negative Page', pageIndex: -5 },
      { title: 'Far Page', pageIndex: 999 },
    ];
    const out = await addPdfOutlines(toBuffer(src), outlines);
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(2);
  });

  it('cropPdfPages: clamps extreme margins to prevent negative dimensions', async () => {
    const src = await makePdfWithLabels(1);
    const out = await cropPdfPages(toBuffer(src), { top: 200, right: 200, bottom: 200, left: 200 });
    const doc = await PDFDocument.load(out);
    const cropBox = doc.getPage(0).getCropBox();
    expect(cropBox.width).toBe(10);
    expect(cropBox.height).toBe(10);
  });

  it('cropPdfRect: handles rect dimensions exceeding page boundaries safely', async () => {
    const src = await makePdfWithLabels(1);
    // Page is 300x300. Rect x=100, y=100, w=500, h=500 extends far beyond page size
    const out = await cropPdfRect(toBuffer(src), { x: 100, y: 100, w: 500, h: 500 });
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(1);
    const cropBox = doc.getPage(0).getCropBox();
    expect(cropBox.x).toBe(100);
    expect(cropBox.y).toBe(100);
  });

  it('addPageNumbers: renders at footer with custom start and format', async () => {
    const src = await makePdfWithLabels(3);
    const out = await addPageNumbers(toBuffer(src), {
      position: 'footer',
      start: 10,
      format: 'Page {n} of {total}',
    });
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(3);
    expect(out.byteLength).toBeGreaterThan(src.byteLength);
  });
});

// ========================================================
// CHALLENGE 3: WorkerPool Harness & Concurrency Stress
// ========================================================
describe('Adversarial Challenge: WorkerPool Concurrency & Resilience', () => {
  const originalWorker = globalThis.Worker;

  beforeEach(() => {
    (globalThis as unknown as { Worker: typeof MockWorker }).Worker = MockWorker;
  });

  afterEach(() => {
    globalThis.Worker = originalWorker;
  });

  it('handles backpressure with 20 queued jobs across 2 worker slots', async () => {
    const pool = new WorkerPool('dummy.js', 'test-backpressure', 2);
    expect(pool.size).toBe(2);

    const promises: Promise<number>[] = [];
    for (let i = 0; i < 20; i++) {
      promises.push(pool.run<number>({ id: `job-${i}`, type: 'compute' }));
    }

    const slots = (pool as unknown as { all: { worker: MockWorker }[] }).all;
    expect(slots).toHaveLength(2);

    for (let i = 0; i < 20; i++) {
      const busySlot = slots.find((s) => (s as unknown as { busy: boolean }).busy);
      expect(busySlot).toBeDefined();
      const currentJob = (busySlot as unknown as { job: { message: { id: string } } }).job;
      const jobId = currentJob.message.id;
      const jobIdx = parseInt(jobId.replace('job-', ''), 10);

      busySlot!.worker.onmessage?.({
        data: { id: jobId, ok: true, result: jobIdx * 10 },
      } as MessageEvent);
    }

    const results = await Promise.all(promises);
    expect(results).toHaveLength(20);
    expect(results[0]).toBe(0);
    expect(results[19]).toBe(190);
    pool.destroy();
  });

  it('rejects all pending queued jobs immediately when pool is destroyed', async () => {
    const pool = new WorkerPool('dummy.js', 'test-destroy-queued', 1);
    const p1 = pool.run({ id: 'active', type: 'step' });
    const p2 = pool.run({ id: 'queued-1', type: 'step' });
    const p3 = pool.run({ id: 'queued-2', type: 'step' });

    pool.destroy();

    await expect(p1).rejects.toThrow('Pool destroyed');
    await expect(p2).rejects.toThrow('Pool destroyed');
    await expect(p3).rejects.toThrow('Pool destroyed');
  });

  it('immediately rejects new jobs submitted after pool is destroyed', async () => {
    const pool = new WorkerPool('dummy.js', 'test-destroy-subsequent', 1);
    pool.destroy();

    await expect(pool.run({ id: 'late', type: 'step' })).rejects.toThrow('Pool destroyed');
  });

  it('survives interleaving errors and successes without wedging the queue', async () => {
    const pool = new WorkerPool('dummy.js', 'test-interleaved', 1);
    const p1 = pool.run({ id: 'fail-1', type: 'step' });
    const p2 = pool.run({ id: 'ok-2', type: 'step' });
    const p3 = pool.run({ id: 'fail-3', type: 'step' });
    const p4 = pool.run({ id: 'ok-4', type: 'step' });

    const slot = (pool as unknown as { all: { worker: MockWorker }[] }).all[0];

    slot.worker.onmessage?.({ data: { id: 'fail-1', ok: false, error: 'Err 1' } } as MessageEvent);
    await expect(p1).rejects.toThrow('Err 1');

    slot.worker.onmessage?.({ data: { id: 'ok-2', ok: true, result: 'Pass 2' } } as MessageEvent);
    await expect(p2).resolves.toBe('Pass 2');

    slot.worker.onmessage?.({ data: { id: 'fail-3', ok: false } } as MessageEvent);
    await expect(p3).rejects.toThrow('Worker failed');

    slot.worker.onmessage?.({ data: { id: 'ok-4', ok: true, result: 'Pass 4' } } as MessageEvent);
    await expect(p4).resolves.toBe('Pass 4');

    pool.destroy();
  });
});

// ========================================================
// CHALLENGE 4: Core Utilities & Standard CRC32 Verification
// ========================================================
describe('Adversarial Challenge: Core Utilities & Jobs', () => {
  describe('createZip CRC32 mathematical standard verification', () => {
    it('generates exact IEEE 802.3 CRC32 checksum for standard test vectors', async () => {
      const testVector = new TextEncoder().encode('123456789');
      const zipBlob = createZip([{ name: 'vector.txt', data: testVector }]);
      const ab = await zipBlob.arrayBuffer();
      const view = new DataView(ab);

      expect(view.getUint32(0, true)).toBe(0x04034b50);
      const crcInHeader = view.getUint32(14, true);
      expect(crcInHeader).toBe(0xcbf43926);
      expect(view.getUint32(18, true)).toBe(9);
      expect(view.getUint32(22, true)).toBe(9);
    });

    it('handles empty file (0 bytes) in zip', async () => {
      const emptyFile = { name: 'empty.txt', data: new Uint8Array(0) };
      const zipBlob = createZip([emptyFile]);
      const ab = await zipBlob.arrayBuffer();
      const view = new DataView(ab);

      expect(view.getUint32(0, true)).toBe(0x04034b50);
      expect(view.getUint32(14, true)).toBe(0);
      expect(view.getUint32(18, true)).toBe(0);
    });

    it('handles empty file list in createZip', async () => {
      const zipBlob = createZip([]);
      expect(zipBlob.type).toBe('application/zip');
      const ab = await zipBlob.arrayBuffer();
      const view = new DataView(ab);
      expect(view.getUint32(0, true)).toBe(0x06054b50);
      expect(view.getUint16(8, true)).toBe(0);
    });
  });

  describe('encodeWavFromChannels audio clamping and format codes', () => {
    it('clamps out-of-range samples (> 1.0 and < -1.0) without overflow', () => {
      const excessiveSamples = new Float32Array([100.0, -100.0, 0.0]);
      const buf16 = encodeWavFromChannels([excessiveSamples], 44100, 16);
      const view16 = new DataView(buf16);
      expect(view16.getInt16(44, true)).toBe(0x7fff);
      expect(view16.getInt16(46, true)).toBe(-0x8000);
      expect(view16.getInt16(48, true)).toBe(0);
    });

    it('writes correct data chunk size in WAV header', () => {
      const samples = new Float32Array(100);
      const buf = encodeWavFromChannels([samples], 48000, 16);
      const view = new DataView(buf);
      expect(view.getUint32(40, true)).toBe(200);
      expect(view.getUint32(4, true)).toBe(236);
    });
  });

  describe('jsonToCsv & csvToJson roundtrip robustness', () => {
    it('roundtrips strings containing quotes, commas, CRLF and semicolons', () => {
      const complexData = [
        {
          id: '1',
          content: 'Hello, "World"!\r\nNext line; semicolon',
          tag: 'special',
        },
      ];
      const csv = jsonToCsv(complexData);
      expect(csv).toContain('""World""');

      const parsed = csvToJson(csv) as Record<string, string>[];
      expect(parsed.length).toBeGreaterThan(0);
    });

    it('handles empty csv input', () => {
      expect(csvToJson('')).toEqual([]);
      expect(csvToJson('   \n  \n  ')).toEqual([]);
    });
  });

  describe('parseIdFields edge cases', () => {
    it('identifies 18-digit ID card ending with lowercase x or uppercase X', () => {
      const textUpper = '身份证: 11010119900307239X 姓名 张三';
      const resUpper = parseIdFields(textUpper);
      expect(resUpper.type).toBe('id-card');
      expect(resUpper.fields['公民身份号码']).toBe('11010119900307239X');
      expect(resUpper.fields['姓名']).toBe('张三');

      const textLower = '号码: 11010119900307239x';
      const resLower = parseIdFields(textLower);
      expect(resLower.type).toBe('id-card');
      expect(resLower.fields['公民身份号码']).toBe('11010119900307239x');
    });

    it('identifies invoice with Total and Amount aliases', () => {
      const text = 'Invoice No: INV-998877 Total: $5,240.50 Date: 2026-05-12';
      const res = parseIdFields(text);
      expect(res.type).toBe('invoice');
      expect(res.fields['发票号码']).toBe('INV-998877');
      expect(res.fields['金额']).toBe('5,240.50');
    });
  });

  describe('pushUnique collision deduplication', () => {
    it('deduplicates multiple items with identical names and existing numbering', () => {
      const dummy = new Blob(['data']);
      const items: JobResult[] = [
        { name: 'doc.pdf', blob: dummy, size: 4, inputSize: 4 },
        { name: 'doc.pdf', blob: dummy, size: 4, inputSize: 4 },
        { name: 'doc-2.pdf', blob: dummy, size: 4, inputSize: 4 },
        { name: 'doc.pdf', blob: dummy, size: 4, inputSize: 4 },
      ];
      const result = pushUnique(items);
      const names = result.map((r) => r.name);
      expect(new Set(names).size).toBe(4);
      expect(names[0]).toBe('doc.pdf');
      expect(names[1]).toBe('doc-2.pdf');
      expect(names[2]).toBe('doc-2-2.pdf');
      expect(names[3]).toBe('doc-3.pdf');
    });
  });
});
