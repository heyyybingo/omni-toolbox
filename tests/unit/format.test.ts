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
  describe('empty and default handling', () => {
    it('defaults to all pages when input is empty, null, or undefined', () => {
      expect(parsePageRange('', 3)).toEqual([0, 1, 2]);
      expect(parsePageRange(null, 2)).toEqual([0, 1]);
      expect(parsePageRange(undefined, 4)).toEqual([0, 1, 2, 3]);
      expect(parsePageRange('   ', 3)).toEqual([0, 1, 2]);
      expect(parsePageRange('', 0)).toEqual([]);
    });

    it('handles bare hyphen as full document range', () => {
      expect(parsePageRange('-', 4)).toEqual([0, 1, 2, 3]);
      expect(parsePageRange('  -  ', 3)).toEqual([0, 1, 2]);
    });
  });

  describe('discrete page numbers', () => {
    it('parses single pages correctly', () => {
      expect(parsePageRange('1', 5)).toEqual([0]);
      expect(parsePageRange('3', 5)).toEqual([2]);
      expect(parsePageRange('5', 5)).toEqual([4]);
    });

    it('parses comma-separated discrete pages', () => {
      expect(parsePageRange('1, 3, 5', 5)).toEqual([0, 2, 4]);
      expect(parsePageRange('  2 ,  4  ', 5)).toEqual([1, 3]);
    });

    it('deduplicates and sorts discrete page numbers', () => {
      expect(parsePageRange('1, 1, 2, 2, 3', 5)).toEqual([0, 1, 2]);
      expect(parsePageRange('5, 2, 4, 1', 5)).toEqual([0, 1, 3, 4]);
    });
  });

  describe('closed ranges (A-B)', () => {
    it('parses standard ascending ranges', () => {
      expect(parsePageRange('1-3', 5)).toEqual([0, 1, 2]);
      expect(parsePageRange('2-4', 5)).toEqual([1, 2, 3]);
      expect(parsePageRange('1-5', 5)).toEqual([0, 1, 2, 3, 4]);
    });

    it('handles inverted ranges (B-A) by sorting min to max', () => {
      expect(parsePageRange('3-1', 5)).toEqual([0, 1, 2]);
      expect(parsePageRange('5-2', 5)).toEqual([1, 2, 3, 4]);
    });

    it('handles single-page ranges (A-A)', () => {
      expect(parsePageRange('2-2', 5)).toEqual([1]);
    });

    it('tolerates spaces around the hyphen in range', () => {
      expect(parsePageRange(' 2 - 4 ', 5)).toEqual([1, 2, 3]);
    });
  });

  describe('open ranges (A- and -N)', () => {
    it('parses open-ended ranges (A-) up to totalPages', () => {
      expect(parsePageRange('1-', 5)).toEqual([0, 1, 2, 3, 4]);
      expect(parsePageRange('3-', 5)).toEqual([2, 3, 4]);
      expect(parsePageRange('5-', 5)).toEqual([4]);
      expect(parsePageRange('  2 -  ', 4)).toEqual([1, 2, 3]);
    });

    it('parses open-start ranges (-N) from page 1 to N', () => {
      expect(parsePageRange('-1', 5)).toEqual([0]);
      expect(parsePageRange('-3', 5)).toEqual([0, 1, 2]);
      expect(parsePageRange('-5', 5)).toEqual([0, 1, 2, 3, 4]);
      expect(parsePageRange('  - 3  ', 5)).toEqual([0, 1, 2]);
    });
  });

  describe('clamping and boundary behavior', () => {
    it('clamps open-start range exceeding pageCount', () => {
      expect(parsePageRange('-10', 4)).toEqual([0, 1, 2, 3]);
    });

    it('clamps range ending beyond pageCount', () => {
      expect(parsePageRange('2-10', 4)).toEqual([1, 2, 3]);
    });

    it('clamps range starting below 1', () => {
      expect(parsePageRange('0-3', 4)).toEqual([0, 1, 2]);
    });
  });

  describe('mixed and complex combinations', () => {
    it('parses mixed discrete, closed, and open ranges', () => {
      expect(parsePageRange('1, 3-4, 6-', 7)).toEqual([0, 2, 3, 5, 6]);
      expect(parsePageRange('-2, 4, 6-7', 7)).toEqual([0, 1, 3, 5, 6]);
    });

    it('handles overlapping ranges cleanly', () => {
      expect(parsePageRange('-2, 2-', 4)).toEqual([0, 1, 2, 3]);
      expect(parsePageRange('1-3, 2-4', 5)).toEqual([0, 1, 2, 3]);
    });

    it('ignores stray commas and whitespace', () => {
      expect(parsePageRange(', 1 , , 3-4 , ', 5)).toEqual([0, 2, 3]);
    });
  });

  describe('invalid input rejection', () => {
    it('throws error for non-numeric tokens', () => {
      expect(() => parsePageRange('abc', 3)).toThrow();
      expect(() => parsePageRange('1-abc', 3)).toThrow();
      expect(() => parsePageRange('abc-3', 3)).toThrow();
      expect(() => parsePageRange('1#3', 3)).toThrow();
    });

    it('throws error for multiple hyphens in range', () => {
      expect(() => parsePageRange('1-2-3', 5)).toThrow();
      expect(() => parsePageRange('--3', 5)).toThrow();
    });

    it('throws error when no valid pages result', () => {
      expect(() => parsePageRange('9', 3)).toThrow();
      expect(() => parsePageRange('0', 3)).toThrow();
      expect(() => parsePageRange('6-10', 5)).toThrow();
      expect(() => parsePageRange('6-', 5)).toThrow();
      expect(() => parsePageRange(',,,', 3)).toThrow();
    });

    it('throws error when pageCount is non-positive', () => {
      expect(() => parsePageRange('1-3', 0)).toThrow();
    });
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

describe('isVisualTool mapping', () => {
  it('recognizes image-transform as a visual tool', async () => {
    const { isVisualTool } = await import('@/engine/live-preview');
    expect(isVisualTool('image-transform')).toBe(true);
  });

  it('maintains image-rotate as backward compatible alias', async () => {
    const { isVisualTool } = await import('@/engine/live-preview');
    expect(isVisualTool('image-rotate')).toBe(true);
  });

  it('recognizes all other visual image and PDF tools', async () => {
    const { isVisualTool } = await import('@/engine/live-preview');
    const expected = [
      'image-convert',
      'image-compress',
      'image-resize',
      'image-watermark',
      'image-color',
      'pdf-watermark',
      'pdf-rotate',
      'pdf-img-wm',
    ];
    for (const id of expected) {
      expect(isVisualTool(id)).toBe(true);
    }
  });

  it('rejects non-visual tools', async () => {
    const { isVisualTool } = await import('@/engine/live-preview');
    expect(isVisualTool('jwt')).toBe(false);
    expect(isVisualTool('base64')).toBe(false);
    expect(isVisualTool('json-format')).toBe(false);
    expect(isVisualTool('uuid')).toBe(false);
  });
});

