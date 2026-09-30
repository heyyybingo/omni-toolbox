import { describe, it, expect } from 'vitest';
import {
  formatBytes,
  baseName,
  extOf,
  uniqueName,
  parsePageRange,
  luhnValid,
  idCardChecksumValid,
  parseJsonSafe,
  formatJson,
  minifyJson,
  encodeWavFromChannels,
} from '@/lib/utils';

describe('formatBytes', () => {
  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.00 MB');
  });
});

describe('names', () => {
  it('baseName and extOf', () => {
    expect(baseName('a/b/photo.PNG')).toBe('a/b/photo');
    expect(extOf('photo.PNG')).toBe('PNG');
    expect(extOf('noext')).toBe('FILE');
  });

  it('uniqueName dedupes', () => {
    const used = new Set<string>();
    expect(uniqueName('a.png', used)).toBe('a.png');
    expect(uniqueName('a.png', used)).toBe('a-2.png');
    expect(uniqueName('a.png', used)).toBe('a-3.png');
  });
});

describe('parsePageRange', () => {
  it('empty means all pages', () => {
    expect(parsePageRange('', 3)).toEqual([0, 1, 2]);
    expect(parsePageRange(null, 2)).toEqual([0, 1]);
  });

  it('parses ranges and singles', () => {
    expect(parsePageRange('1-3,5', 5)).toEqual([0, 1, 2, 4]);
    expect(parsePageRange('2', 3)).toEqual([1]);
    expect(parsePageRange('3-1', 3)).toEqual([0, 1, 2]);
  });

  it('rejects invalid', () => {
    expect(() => parsePageRange('abc', 3)).toThrow();
    expect(() => parsePageRange('9', 3)).toThrow();
  });
});

describe('validators', () => {
  it('luhn', () => {
    expect(luhnValid('4242 4242 4242 4242')).toBe(true);
    expect(luhnValid('4242424242424241')).toBe(false);
    expect(luhnValid('123')).toBe(false);
  });

  it('id card checksum', () => {
    expect(idCardChecksumValid('11010519491231002X')).toBe(true);
    expect(idCardChecksumValid('110105194912310021')).toBe(false);
    expect(idCardChecksumValid('123')).toBe(false);
  });
});

describe('json', () => {
  it('validates and formats', () => {
    const raw = '{"a":1,"b":[true,null]}';
    expect(parseJsonSafe(raw).ok).toBe(true);
    const fmt = formatJson(raw, 2);
    expect(fmt.ok).toBe(true);
    if (!fmt.ok) return;
    expect(fmt.value).toContain('"a": 1');
    const min = minifyJson(fmt.value);
    expect(min.ok).toBe(true);
    if (!min.ok) return;
    expect(min.value).toBe('{"a":1,"b":[true,null]}');
  });

  it('reports errors', () => {
    expect(parseJsonSafe('{').ok).toBe(false);
    expect(formatJson('{').ok).toBe(false);
  });
});

describe('wav', () => {
  it('writes pcm header', () => {
    const left = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const buf = encodeWavFromChannels([left], 44100);
    const view = new DataView(buf);
    const tag = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    expect(tag).toBe('RIFF');
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint32(40, true)).toBe(left.length * 2);
  });
});

describe('fuzzy search', () => {
  it('matches substring, tokens and subsequence', async () => {
    const { fuzzyMatch, toolSearchScore } = await import('@/lib/utils');
    expect(fuzzyMatch('水印', 'PDF 水印')).toBe(true);
    expect(fuzzyMatch('pdf wm', 'PDF 水印 watermark')).toBe(true);
    expect(fuzzyMatch('pdf 水印', 'PDF 水印工具')).toBe(true);
    expect(toolSearchScore('压缩', ['图片压缩', '图片', '减小体积'])).toBeGreaterThan(0);
    expect(toolSearchScore('zzzz', ['图片压缩'])).toBe(0);
  });
});

describe('id fields', () => {
  it('parses id card number', async () => {
    const { parseIdFields } = await import('@/engine/jobs');
    const r = parseIdFields('姓名 张三 性别男 公民身份号码 11010519491231002X');
    expect(r.type).toBe('id-card');
    expect(r.fields['公民身份号码']).toBe('11010519491231002X');
  });
});

describe('json csv', () => {
  it('roundtrips objects', async () => {
    const { jsonToCsv, csvToJson } = await import('@/lib/utils');
    const rows = [
      { a: 1, b: 'x,y' },
      { a: 2, b: 'z' },
    ];
    const csv = jsonToCsv(rows);
    expect(csv.split('\n')[0]).toBe('a,b');
    const back = csvToJson(csv) as { a: string; b: string }[];
    expect(back).toHaveLength(2);
    expect(back[0].b).toBe('x,y');
    expect(back[1].a).toBe('2');
  });

  it('supports custom delimiter', async () => {
    const { jsonToCsv, csvToJson } = await import('@/lib/utils');
    const rows = [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ];
    const tsv = jsonToCsv(rows, '\t');
    expect(tsv.split('\n')[0]).toBe('name\tage');
    const back = csvToJson(tsv, '\t') as { name: string; age: string }[];
    expect(back[0].name).toBe('Alice');
    expect(back[1].age).toBe('25');
  });
});

describe('computeTabSlices', () => {
  it('returns all tabs when count fits', async () => {
    const { computeTabSlices } = await import('@/lib/utils');
    const tabs = ['t1', 't2', 't3'];
    const res = computeTabSlices(tabs, 5, 't1');
    expect(res.visibleTabs).toEqual(['t1', 't2', 't3']);
    expect(res.overflowTabs).toEqual([]);
  });

  it('slices into visible and overflow when active is in visible range', async () => {
    const { computeTabSlices } = await import('@/lib/utils');
    const tabs = ['t1', 't2', 't3', 't4', 't5'];
    const res = computeTabSlices(tabs, 3, 't2');
    expect(res.visibleTabs).toEqual(['t1', 't2', 't3']);
    expect(res.overflowTabs).toEqual(['t4', 't5']);
  });

  it('preserves active tab in visible set when active is in overflow range', async () => {
    const { computeTabSlices } = await import('@/lib/utils');
    const tabs = ['t1', 't2', 't3', 't4', 't5'];
    const res = computeTabSlices(tabs, 3, 't5');
    // active 't5' is hoisted into visible set
    expect(res.visibleTabs).toEqual(['t1', 't2', 't5']);
    expect(res.overflowTabs).toEqual(['t3', 't4']);
  });
});
