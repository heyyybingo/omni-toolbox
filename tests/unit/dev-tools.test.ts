import { describe, it, expect } from 'vitest';
import {
  jsonToYaml,
  yamlToJson,
  jsonToTypeScript,
  computeTextDiff,
  testRegex,
  buildIcoFile,
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
});
