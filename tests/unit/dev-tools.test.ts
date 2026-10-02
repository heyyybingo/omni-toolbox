import { describe, it, expect } from 'vitest';
import {
  jsonToYaml,
  yamlToJson,
  jsonToTypeScript,
  computeTextDiff,
  testRegex,
  buildIcoFile,
  parseJwt,
  parseColor,
  rgbToHsl,
} from '@/engine/dev-tools';

describe('dev-tools engine', () => {
  describe('JSON ↔ YAML', () => {
    it('converts json to yaml correctly', () => {
      const json = JSON.stringify({ name: 'toolbox', version: 2, features: ['pdf', 'image'] });
      const { yaml, error } = jsonToYaml(json);
      expect(error).toBeUndefined();
      expect(yaml).toContain('name: toolbox');
      expect(yaml).toContain('version: 2');
      expect(yaml).toContain('- pdf');
    });

    it('converts yaml to json correctly', () => {
      const yaml = `
name: toolbox
version: 2
features:
  - pdf
  - image
`;
      const { json, error } = yamlToJson(yaml);
      expect(error).toBeUndefined();
      const parsed = JSON.parse(json);
      expect(parsed.name).toBe('toolbox');
      expect(parsed.features).toHaveLength(2);
    });

    it('handles invalid json/yaml gracefully', () => {
      const { error: jsonErr } = jsonToYaml('{invalid');
      expect(jsonErr).toBeDefined();

      const { error: yamlErr } = yamlToJson('invalid: : yaml');
      expect(yamlErr).toBeDefined();
    });
  });

  describe('JSON → TypeScript', () => {
    it('generates interface for flat object', () => {
      const json = JSON.stringify({ id: 123, title: 'Test', active: true });
      const { code, error } = jsonToTypeScript(json, { rootName: 'Item', exportPrefix: true });
      expect(error).toBeUndefined();
      expect(code).toContain('export interface Item');
      expect(code).toContain('id: number;');
      expect(code).toContain('title: string;');
      expect(code).toContain('active: boolean;');
    });

    it('generates nested interfaces for child objects', () => {
      const json = JSON.stringify({
        id: 1,
        user: { name: 'Alice', age: 30 },
      });
      const { code } = jsonToTypeScript(json, { rootName: 'Response' });
      expect(code).toContain('interface Response');
      expect(code).toContain('interface Response_user');
      expect(code).toContain('name: string;');
    });

    it('generates array types correctly', () => {
      const json = JSON.stringify({
        tags: ['a', 'b', 'c'],
        counts: [1, 2, 3],
      });
      const { code } = jsonToTypeScript(json, { rootName: 'Meta' });
      expect(code).toContain('tags: string[];');
      expect(code).toContain('counts: number[];');
    });
  });

  describe('Text Diff', () => {
    it('computes line additions and removals', () => {
      const left = 'line 1\nline 2\nline 3';
      const right = 'line 1\nline 2 modified\nline 3\nline 4';
      const { stats, lines } = computeTextDiff(left, right, 'lines');
      expect(stats.added).toBeGreaterThan(0);
      expect(stats.removed).toBeGreaterThan(0);
      expect(lines.some((l) => l.type === 'added' && l.value.includes('modified'))).toBe(true);
    });
  });

  describe('Regex Tester', () => {
    it('matches pattern and captures groups', () => {
      const pattern = '(\\d{4})-(\\d{2})-(\\d{2})';
      const text = 'Today is 2026-09-30, tomorrow is 2026-10-01';
      const { matches, error } = testRegex(pattern, 'g', text);
      expect(error).toBeUndefined();
      expect(matches).toHaveLength(2);
      expect(matches[0].text).toBe('2026-09-30');
      expect(matches[0].groups).toEqual(['2026', '09', '30']);
      expect(matches[1].text).toBe('2026-10-01');
    });

    it('replaces text using substitution string', () => {
      const pattern = '(\\w+)@(\\w+)\\.com';
      const text = 'Contact: test@example.com';
      const { replacedText } = testRegex(pattern, 'g', text, 'masked@***.com');
      expect(replacedText).toBe('Contact: masked@***.com');
    });
  });

  describe('ICO File Generator', () => {
    it('builds a valid binary ICO header from sample buffers', () => {
      const fakePng16 = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer;
      const fakePng32 = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer;
      const blob = buildIcoFile([
        { size: 16, buffer: fakePng16 },
        { size: 32, buffer: fakePng32 },
      ]);
      expect(blob.type).toBe('image/x-icon');
      expect(blob.size).toBeGreaterThan(22); // Header + 2 entries + payloads
    });
  });

  describe('JWT Decoder', () => {
    it('decodes standard 3-part unpadded base64url token', () => {
      // Header: {"alg":"HS256","typ":"JWT"}
      // Payload: {"sub":"1234567890","name":"John Doe","admin":true}
      // Note payload length 67 (67 % 4 = 3, requires 1 '=' padding)
      const token =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
        'eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiYWRtaW4iOnRydWV9.' +
        'TJVA95OrM7E2cBab30RMHrHDcEfxjoYZgeFONFh7HgQ';

      const res = parseJwt(token);
      expect(res).not.toBeNull();
      expect(res?.header).toEqual({ alg: 'HS256', typ: 'JWT' });
      expect(res?.payload.sub).toBe('1234567890');
      expect(res?.payload.name).toBe('John Doe');
      expect(res?.payload.admin).toBe(true);
    });

    it('decodes payload with unpadded length mod 4 === 2 (needs 2 equal signs)', () => {
      // Payload: {"name":"Alice"}
      // Base64url: "eyJuYW1lIjoiQWxpY2UifQ" (length 22, 22 % 4 === 2)
      const token = 'eyJhbGciOiJIUzI1NiJ9.eyJuYW1lIjoiQWxpY2UifQ.sig';
      const res = parseJwt(token);
      expect(res).not.toBeNull();
      expect(res?.payload).toEqual({ name: 'Alice' });
    });

    it('decodes payload with unpadded length mod 4 === 3 (needs 1 equal sign)', () => {
      // Payload: {"uid":123}
      // Base64url: "eyJ1aWQiOjEyM30" (length 15, 15 % 4 === 3)
      const token = 'eyJhbGciOiJIUzI1NiJ9.eyJ1aWQiOjEyM30.sig';
      const res = parseJwt(token);
      expect(res).not.toBeNull();
      expect(res?.payload).toEqual({ uid: 123 });
    });

    it('accepts tokens that already include base64 padding =', () => {
      const token = 'eyJhbGciOiJIUzI1NiJ9.eyJ1aWQiOjEyM30=.sig';
      const res = parseJwt(token);
      expect(res).not.toBeNull();
      expect(res?.payload).toEqual({ uid: 123 });
    });

    it('decodes base64url characters - and _ correctly', () => {
      const token = 'eyJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJodHRwczovL2V4YW1wbGUuY29tL3Rlc3Q_YT0xJmI9MiJ9.sig';
      const res = parseJwt(token);
      expect(res).not.toBeNull();
      expect(res?.payload.url).toBe('https://example.com/test?a=1&b=2');
    });

    it('correctly decodes UTF-8 multi-byte unicode characters and emojis', () => {
      // Payload: {"user":"张三","role":"管理员","tool":"前端工具箱","emoji":"🚀"}
      // Base64url: eyJ1c2VyIjoi5byg5LiJIiwicm9sZSI6IueuoeeQhuWRmCIsInRvb2wiOiLliY3nq6_lt6XlhbfnrrEiLCJlbW9qaSI6IvCfmoAifQ
      const token =
        'eyJhbGciOiJIUzI1NiJ9.' +
        'eyJ1c2VyIjoi5byg5LiJIiwicm9sZSI6IueuoeeQhuWRmCIsInRvb2wiOiLliY3nq6_lt6XlhbfnrrEiLCJlbW9qaSI6IvCfmoAifQ.' +
        'sig';

      const res = parseJwt(token);
      expect(res).not.toBeNull();
      expect(res?.payload.user).toBe('张三');
      expect(res?.payload.role).toBe('管理员');
      expect(res?.payload.tool).toBe('前端工具箱');
      expect(res?.payload.emoji).toBe('🚀');
    });

    it('handles 2-part tokens without signature section', () => {
      const token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9';
      const res = parseJwt(token);
      expect(res).not.toBeNull();
      expect(res?.header.alg).toBe('HS256');
      expect(res?.payload.sub).toBe('12345');
    });

    it('returns null on invalid or malformed tokens', () => {
      expect(parseJwt('')).toBeNull();
      expect(parseJwt('   ')).toBeNull();
      expect(parseJwt('not-a-valid-token')).toBeNull();
      expect(parseJwt('singlepart')).toBeNull();
      expect(parseJwt('eyJhbGciOiJIUzI1NiJ9.bm90LWpzb24')).toBeNull();
      expect(parseJwt('eyJhbGciOiJIUzI1NiJ9.!!!invalid!!!')).toBeNull();
    });
  });

  describe('Color Converter', () => {
    describe('3-digit HEX expansion', () => {
      it('expands #fff to pure white #FFFFFF with correct RGB and HSL', () => {
        const res = parseColor('#fff');
        expect(res.hex).toBe('#FFFFFF');
        expect(res.rgb).toEqual({ r: 255, g: 255, b: 255, css: 'rgb(255, 255, 255)' });
        expect(res.hsl).toEqual({ h: 0, s: 0, l: 100, css: 'hsl(0, 0%, 100%)' });
      });

      it('expands #000 to pure black #000000 with correct RGB and HSL', () => {
        const res = parseColor('#000');
        expect(res.hex).toBe('#000000');
        expect(res.rgb).toEqual({ r: 0, g: 0, b: 0, css: 'rgb(0, 0, 0)' });
        expect(res.hsl).toEqual({ h: 0, s: 0, l: 0, css: 'hsl(0, 0%, 0%)' });
      });

      it('expands #f00 to pure red #FF0000', () => {
        const res = parseColor('#f00');
        expect(res.hex).toBe('#FF0000');
        expect(res.rgb).toEqual({ r: 255, g: 0, b: 0, css: 'rgb(255, 0, 0)' });
        expect(res.hsl).toEqual({ h: 0, s: 100, l: 50, css: 'hsl(0, 100%, 50%)' });
      });

      it('expands #0f0 to pure green #00FF00', () => {
        const res = parseColor('#0f0');
        expect(res.hex).toBe('#00FF00');
        expect(res.rgb).toEqual({ r: 0, g: 255, b: 0, css: 'rgb(0, 255, 0)' });
        expect(res.hsl).toEqual({ h: 120, s: 100, l: 50, css: 'hsl(120, 100%, 50%)' });
      });

      it('expands #00f to pure blue #0000FF', () => {
        const res = parseColor('#00f');
        expect(res.hex).toBe('#0000FF');
        expect(res.rgb).toEqual({ r: 0, g: 0, b: 255, css: 'rgb(0, 0, 255)' });
        expect(res.hsl).toEqual({ h: 240, s: 100, l: 50, css: 'hsl(240, 100%, 50%)' });
      });

      it('expands #123 to #112233', () => {
        const res = parseColor('#123');
        expect(res.hex).toBe('#112233');
        expect(res.rgb.r).toBe(17);
        expect(res.rgb.g).toBe(34);
        expect(res.rgb.b).toBe(51);
      });

      it('handles 3-digit hex without # prefix', () => {
        const res = parseColor('fff');
        expect(res.hex).toBe('#FFFFFF');
        expect(res.rgb.r).toBe(255);
      });
    });

    describe('6-digit HEX parsing', () => {
      it('parses brand color #0C66E4 correctly', () => {
        const res = parseColor('#0C66E4');
        expect(res.hex).toBe('#0C66E4');
        expect(res.rgb).toEqual({ r: 12, g: 102, b: 228, css: 'rgb(12, 102, 228)' });
        expect(res.hsl).toEqual({ h: 215, s: 90, l: 47, css: 'hsl(215, 90%, 47%)' });
      });

      it('handles 6-digit hex without # prefix', () => {
        const res = parseColor('0C66E4');
        expect(res.hex).toBe('#0C66E4');
        expect(res.rgb.r).toBe(12);
        expect(res.rgb.g).toBe(102);
        expect(res.rgb.b).toBe(228);
      });

      it('handles lowercase hex strings', () => {
        const res = parseColor('#00ccff');
        expect(res.hex).toBe('#00CCFF');
        expect(res.rgb).toEqual({ r: 0, g: 204, b: 255, css: 'rgb(0, 204, 255)' });
        expect(res.hsl).toEqual({ h: 192, s: 100, l: 50, css: 'hsl(192, 100%, 50%)' });
      });
    });

    describe('RGB to HSL conversion precision', () => {
      it('converts yellow (255, 255, 0)', () => {
        const hsl = rgbToHsl(255, 255, 0);
        expect(hsl).toEqual({ h: 60, s: 100, l: 50, css: 'hsl(60, 100%, 50%)' });
      });

      it('converts cyan (0, 255, 255)', () => {
        const hsl = rgbToHsl(0, 255, 255);
        expect(hsl).toEqual({ h: 180, s: 100, l: 50, css: 'hsl(180, 100%, 50%)' });
      });

      it('converts magenta (255, 0, 255)', () => {
        const hsl = rgbToHsl(255, 0, 255);
        expect(hsl).toEqual({ h: 300, s: 100, l: 50, css: 'hsl(300, 100%, 50%)' });
      });

      it('converts mid-gray (128, 128, 128)', () => {
        const hsl = rgbToHsl(128, 128, 128);
        expect(hsl).toEqual({ h: 0, s: 0, l: 50, css: 'hsl(0, 0%, 50%)' });
      });
    });

    describe('fallback and malformed inputs', () => {
      it('falls back safely to default color on invalid inputs', () => {
        expect(parseColor('').hex).toBe('#0C66E4');
        expect(parseColor('invalid').hex).toBe('#0C66E4');
        expect(parseColor('#12').hex).toBe('#0C66E4');
        expect(parseColor('#12345').hex).toBe('#0C66E4');
        expect(parseColor('#gggggg').hex).toBe('#0C66E4');
      });
    });
  });
});
