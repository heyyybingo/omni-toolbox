import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseJwt, parseColor, rgbToHsl } from '@/engine/dev-tools';

// Independent mathematical reference oracle for RGB to HSL
function referenceRgbToHsl(r: number, g: number, b: number) {
  const rNorm = Math.max(0, Math.min(255, r)) / 255;
  const gNorm = Math.max(0, Math.min(255, g)) / 255;
  const bNorm = Math.max(0, Math.min(255, b)) / 255;
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const delta = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (delta !== 0) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    if (max === rNorm) {
      h = ((gNorm - bNorm) / delta + (gNorm < bNorm ? 6 : 0)) * 60;
    } else if (max === gNorm) {
      h = ((bNorm - rNorm) / delta + 2) * 60;
    } else {
      h = ((rNorm - gNorm) / delta + 4) * 60;
    }
  }

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

// Helper to construct arbitrary valid base64url JWT
function makeJwt(headerObj: unknown, payloadObj: unknown, sig = 'signature'): string {
  const toBase64Url = (obj: unknown): string => {
    const jsonStr = typeof obj === 'string' ? obj : JSON.stringify(obj);
    const bytes = new TextEncoder().encode(jsonStr);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  };

  const h = toBase64Url(headerObj);
  const p = toBase64Url(payloadObj);
  return `${h}.${p}.${sig}`;
}

describe('M2 Adversarial Challenge: parseJwt', () => {
  describe('Unusual Base64URL Padding and Modulo Offsets', () => {
    it('handles mod 4 === 0 (no padding required)', () => {
      // payload length multiple of 4
      const token = makeJwt({ alg: 'none' }, { key: '1234' });
      const parsed = parseJwt(token);
      expect(parsed).not.toBeNull();
      expect(parsed?.payload).toEqual({ key: '1234' });
    });

    it('handles mod 4 === 2 (requires 2 "=" signs)', () => {
      const token = makeJwt({ alg: 'HS256' }, { name: 'Alice' });
      const parts = token.split('.');
      expect(parts[1].length % 4).toBe(2);
      const parsed = parseJwt(token);
      expect(parsed).not.toBeNull();
      expect(parsed?.payload).toEqual({ name: 'Alice' });
    });

    it('handles mod 4 === 3 (requires 1 "=" sign)', () => {
      const token = makeJwt({ alg: 'HS256' }, { uid: 123 });
      const parts = token.split('.');
      expect(parts[1].length % 4).toBe(3);
      const parsed = parseJwt(token);
      expect(parsed).not.toBeNull();
      expect(parsed?.payload).toEqual({ uid: 123 });
    });

    it('handles tokens that already contain explicit base64 padding (= or ==)', () => {
      const token = makeJwt({ alg: 'HS256' }, { name: 'Alice' });
      const parts = token.split('.');
      const paddedToken = `${parts[0]}.${parts[1]}==.${parts[2]}`;
      const parsed = parseJwt(paddedToken);
      expect(parsed).not.toBeNull();
      expect(parsed?.payload).toEqual({ name: 'Alice' });
    });

    it('handles tokens where base64url characters "-" and "_" appear multiple times', () => {
      // Characters that in standard base64 are + and /
      // Binary bytes 0xFB (11111011) and 0xFF (11111111) produce - and _
      const payload = {
        path: '/usr/local/bin',
        query: 'search?a=1&b=2+3',
        url: 'https://example.com/test?flag=-1&val=_test_',
        dashUnderscore: '--__--__',
      };
      const token = makeJwt({ alg: 'HS256', typ: 'JWT' }, payload);
      const parsed = parseJwt(token);
      expect(parsed).not.toBeNull();
      expect(parsed?.payload).toEqual(payload);
    });

    it('handles valid 2-part tokens (header + payload, no signature)', () => {
      const token = makeJwt({ alg: 'none' }, { sub: 'guest-1001' }).split('.').slice(0, 2).join('.');
      const parsed = parseJwt(token);
      expect(parsed).not.toBeNull();
      expect(parsed?.header).toEqual({ alg: 'none' });
      expect(parsed?.payload).toEqual({ sub: 'guest-1001' });
    });

    it('handles 4-part and 5-part tokens by parsing the first two parts', () => {
      const token = makeJwt({ alg: 'HS256' }, { sub: 'admin' }) + '.extra1.extra2';
      const parsed = parseJwt(token);
      expect(parsed).not.toBeNull();
      expect(parsed?.payload).toEqual({ sub: 'admin' });
    });
  });

  describe('Unicode Multi-Byte Characters & Emojis', () => {
    it('accurately parses Chinese characters and Chinese punctuation', () => {
      const payload = {
        name: '诸葛孔明',
        quote: '夫君子之行，静以修身，俭以养德。非淡泊无以明志，非宁静无以致远。',
        city: '成都',
      };
      const token = makeJwt({ alg: 'HS256' }, payload);
      const parsed = parseJwt(token);
      expect(parsed).not.toBeNull();
      expect(parsed?.payload).toEqual(payload);
    });

    it('accurately parses Japanese (Hiragana, Katakana, Kanji, Half-width)', () => {
      const payload = {
        hiragana: 'こんにちは',
        katakana: 'オムニツールボックス',
        kanji: '開発者道具箱',
        halfwidth: 'ｶﾀｶﾅ',
      };
      const token = makeJwt({ alg: 'HS256' }, payload);
      const parsed = parseJwt(token);
      expect(parsed).not.toBeNull();
      expect(parsed?.payload).toEqual(payload);
    });

    it('accurately parses Korean (Hangul)', () => {
      const payload = {
        title: '안녕하세요 전 세계 개발자 여러분',
        framework: '리액트 도구함',
      };
      const token = makeJwt({ alg: 'HS256' }, payload);
      const parsed = parseJwt(token);
      expect(parsed).not.toBeNull();
      expect(parsed?.payload).toEqual(payload);
    });

    it('accurately parses RTL languages (Arabic & Hebrew)', () => {
      const payload = {
        arabic: 'مرحبا بالعالم - صندوق الأدوات المتقدم',
        hebrew: 'שלום עולם - ארגז כלים',
      };
      const token = makeJwt({ alg: 'HS256' }, payload);
      const parsed = parseJwt(token);
      expect(parsed).not.toBeNull();
      expect(parsed?.payload).toEqual(payload);
    });

    it('accurately parses Cyrillic, Greek, and Mathematical Symbols', () => {
      const payload = {
        cyrillic: 'Привет, мир! Инструменты разработки',
        greek: 'αβγδε ζηθικ λμνξο πρστυ φχψω',
        math: '∫ f(x)dx = F(x) + C, E = mc² ± √x ≥ π ∑ ∏',
      };
      const token = makeJwt({ alg: 'HS256' }, payload);
      const parsed = parseJwt(token);
      expect(parsed).not.toBeNull();
      expect(parsed?.payload).toEqual(payload);
    });

    it('accurately parses European Accents and Ligatures', () => {
      const payload = {
        accents: 'àéîôù ç ñ å ø æ œ ß ü ö ä ë ï ÿ',
        german: 'Straße und Übergrößen',
        french: 'Cœur et boîte à outils',
        scandinavian: 'Blåbærsyltetøy og smørbrød',
      };
      const token = makeJwt({ alg: 'HS256' }, payload);
      const parsed = parseJwt(token);
      expect(parsed).not.toBeNull();
      expect(parsed?.payload).toEqual(payload);
    });

    it('accurately parses Single, Multi-Codepoint, ZWJ sequences, and Flag Emojis', () => {
      const payload = {
        single: '🚀🔥🎉✨🦄',
        flags: '🇨🇳🇺🇸🇯🇵🇩🇪🇫🇷🇬🇧',
        skinTone: '👍🏻👍🏼👍🏽👍🏾👍🏿',
        zwjFamily: '👨‍👩‍👧‍👦',
        zwjTech: '👩‍💻👨‍💻',
        complexSurrogate: '🐱‍👤🌈🪐',
      };
      const token = makeJwt({ alg: 'HS256' }, payload);
      const parsed = parseJwt(token);
      expect(parsed).not.toBeNull();
      expect(parsed?.payload).toEqual(payload);
    });

    it('accurately parses control characters (newlines, tabs, quotes, backslashes)', () => {
      const payload = {
        multiline: 'Line 1\nLine 2\r\nLine 3\tTabbed',
        quotes: 'He said "Hello" and \\ escaped backslash',
      };
      const token = makeJwt({ alg: 'HS256' }, payload);
      const parsed = parseJwt(token);
      expect(parsed).not.toBeNull();
      expect(parsed?.payload).toEqual(payload);
    });
  });

  describe('Corrupted Tokens & Edge Failures', () => {
    it('returns null on empty, whitespace, and non-token strings', () => {
      expect(parseJwt('')).toBeNull();
      expect(parseJwt('   ')).toBeNull();
      expect(parseJwt('\t\n')).toBeNull();
      expect(parseJwt('not-a-jwt')).toBeNull();
      expect(parseJwt('singleparttoken')).toBeNull();
      expect(parseJwt('...')).toBeNull();
      expect(parseJwt('.')).toBeNull();
      expect(parseJwt('..')).toBeNull();
    });

    it('returns null on invalid base64 characters (!, @, #, $, %, ^, &, *)', () => {
      expect(parseJwt('eyJhbGciOiJIUzI1NiJ9.!!!illegal!!!.sig')).toBeNull();
      expect(parseJwt('header@part.payload#part.sig')).toBeNull();
      expect(parseJwt('validpart.bad$part.sig')).toBeNull();
    });

    it('returns null on mathematically impossible base64 length (len % 4 === 1)', () => {
      // A base64 string of length 1 or 4k+1 cannot decode to full bytes
      expect(parseJwt('eyJhbGciOiJIUzI1NiJ9.A.sig')).toBeNull();
      expect(parseJwt('eyJhbGciOiJIUzI1NiJ9.ABCDE.sig')).toBeNull();
    });

    it('returns null on valid base64 that is not valid JSON', () => {
      // btoa("plain text message not json") = "cGxhaW4gdGV4dCBtZXNzYWdlIG5vdCBqc29u"
      const token = 'eyJhbGciOiJIUzI1NiJ9.cGxhaW4gdGV4dCBtZXNzYWdlIG5vdCBqc29u.sig';
      expect(parseJwt(token)).toBeNull();
    });

    it('returns null on truncated base64 that breaks JSON syntax', () => {
      // Payload {"admin":true} truncated midway
      const token = 'eyJhbGciOiJIUzI1NiJ9.eyJhZG1pbiI.sig';
      expect(parseJwt(token)).toBeNull();
    });

    it('handles JSON primitives (number, boolean, array) without uncaught exception', () => {
      // Payload: 12345
      const tokenNumber = makeJwt({ alg: 'none' }, '12345');
      const parsedNumber = parseJwt(tokenNumber);
      expect(parsedNumber).not.toBeNull();
      expect(parsedNumber?.payload).toBe(12345);

      // Payload: true
      const tokenBool = makeJwt({ alg: 'none' }, 'true');
      const parsedBool = parseJwt(tokenBool);
      expect(parsedBool).not.toBeNull();
      expect(parsedBool?.payload).toBe(true);

      // Payload: [1, 2, 3]
      const tokenArr = makeJwt({ alg: 'none' }, '[1, 2, 3]');
      const parsedArr = parseJwt(tokenArr);
      expect(parsedArr).not.toBeNull();
      expect(parsedArr?.payload).toEqual([1, 2, 3]);
    });

    it('handles large payload (50KB, 1000 items) efficiently', () => {
      const largePayload: Record<string, string> = {};
      for (let i = 0; i < 1000; i++) {
        largePayload[`key_${i}`] = `value_long_string_for_testing_${i}_🚀`;
      }
      const token = makeJwt({ alg: 'HS256' }, largePayload);
      const start = performance.now();
      const parsed = parseJwt(token);
      const elapsed = performance.now() - start;

      expect(parsed).not.toBeNull();
      expect(Object.keys(parsed?.payload as Record<string, string>)).toHaveLength(1000);
      expect(elapsed).toBeLessThan(100); // Must parse in < 100ms
    });

    it('handles deeply nested JSON payload (15 levels)', () => {
      let nested: any = { depth: 15 };
      for (let i = 14; i >= 1; i--) {
        nested = { depth: i, child: nested };
      }
      const token = makeJwt({ alg: 'HS256' }, nested);
      const parsed = parseJwt(token);
      expect(parsed).not.toBeNull();
      expect(parsed?.payload.depth).toBe(1);
    });
  });
});

describe('M2 Adversarial Challenge: parseColor and rgbToHsl', () => {
  describe('3-Digit HEX (#RGB) Expansion and Edge Values', () => {
    it('accurately parses pure black #000', () => {
      const res = parseColor('#000');
      expect(res.hex).toBe('#000000');
      expect(res.rgb).toEqual({ r: 0, g: 0, b: 0, css: 'rgb(0, 0, 0)' });
      expect(res.hsl).toEqual({ h: 0, s: 0, l: 0, css: 'hsl(0, 0%, 0%)' });
    });

    it('accurately parses pure white #FFF and #fff', () => {
      for (const input of ['#FFF', '#fff', 'FFF', 'fff']) {
        const res = parseColor(input);
        expect(res.hex).toBe('#FFFFFF');
        expect(res.rgb).toEqual({ r: 255, g: 255, b: 255, css: 'rgb(255, 255, 255)' });
        expect(res.hsl).toEqual({ h: 0, s: 0, l: 100, css: 'hsl(0, 0%, 100%)' });
      }
    });

    it('accurately parses primary colors in 3-digit shorthand', () => {
      // Red #F00
      const red = parseColor('#F00');
      expect(red.hex).toBe('#FF0000');
      expect(red.rgb).toEqual({ r: 255, g: 0, b: 0, css: 'rgb(255, 0, 0)' });
      expect(red.hsl).toEqual({ h: 0, s: 100, l: 50, css: 'hsl(0, 100%, 50%)' });

      // Green #0F0
      const green = parseColor('#0F0');
      expect(green.hex).toBe('#00FF00');
      expect(green.rgb).toEqual({ r: 0, g: 255, b: 0, css: 'rgb(0, 255, 0)' });
      expect(green.hsl).toEqual({ h: 120, s: 100, l: 50, css: 'hsl(120, 100%, 50%)' });

      // Blue #00F
      const blue = parseColor('#00F');
      expect(blue.hex).toBe('#0000FF');
      expect(blue.rgb).toEqual({ r: 0, g: 0, b: 255, css: 'rgb(0, 0, 255)' });
      expect(blue.hsl).toEqual({ h: 240, s: 100, l: 50, css: 'hsl(240, 100%, 50%)' });
    });

    it('accurately parses secondary colors in 3-digit shorthand', () => {
      // Yellow #FF0
      const yellow = parseColor('#FF0');
      expect(yellow.hex).toBe('#FFFF00');
      expect(yellow.hsl).toEqual({ h: 60, s: 100, l: 50, css: 'hsl(60, 100%, 50%)' });

      // Cyan #0FF
      const cyan = parseColor('#0FF');
      expect(cyan.hex).toBe('#00FFFF');
      expect(cyan.hsl).toEqual({ h: 180, s: 100, l: 50, css: 'hsl(180, 100%, 50%)' });

      // Magenta #F0F
      const magenta = parseColor('#F0F');
      expect(magenta.hex).toBe('#FF00FF');
      expect(magenta.hsl).toEqual({ h: 300, s: 100, l: 50, css: 'hsl(300, 100%, 50%)' });
    });

    it('accurately parses non-primary 3-digit hex values', () => {
      const res = parseColor('#abc');
      expect(res.hex).toBe('#AABBCC');
      expect(res.rgb).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc, css: 'rgb(170, 187, 204)' });

      const res2 = parseColor('#789');
      expect(res2.hex).toBe('#778899');
      expect(res2.rgb).toEqual({ r: 0x77, g: 0x88, b: 0x99, css: 'rgb(119, 136, 153)' });
    });
  });

  describe('6-Digit HEX (#RRGGBB) Parsing', () => {
    it('accurately parses full 6-digit hex with mixed case and leading whitespace', () => {
      const res = parseColor('  #0c66e4  ');
      expect(res.hex).toBe('#0C66E4');
      expect(res.rgb).toEqual({ r: 12, g: 102, b: 228, css: 'rgb(12, 102, 228)' });
    });

    it('accurately parses 6-digit hex without # prefix', () => {
      const res = parseColor('0C66E4');
      expect(res.hex).toBe('#0C66E4');
      expect(res.rgb).toEqual({ r: 12, g: 102, b: 228, css: 'rgb(12, 102, 228)' });
    });

    it('verifies Saturation is strictly 0% for all neutral grayscale hexes', () => {
      const grays = ['#000000', '#1A1A1A', '#333333', '#808080', '#A0A0A0', '#CCCCCC', '#FFFFFF'];
      for (const gray of grays) {
        const res = parseColor(gray);
        expect(res.hsl.s).toBe(0);
        expect(res.hsl.h).toBe(0);
      }
    });
  });

  describe('HSL Conversion Accuracy & Mathematical Oracle Validation', () => {
    const testCases: Array<{ r: number; g: number; b: number; name: string }> = [
      // All 6 hue sectors
      { r: 255, g: 128, b: 0, name: 'Orange (Sector 0)' },
      { r: 192, g: 255, b: 0, name: 'Lime (Sector 1)' },
      { r: 0, g: 255, b: 128, name: 'Spring Green (Sector 2)' },
      { r: 0, g: 128, b: 255, name: 'Sky Blue (Sector 3)' },
      { r: 128, g: 0, b: 255, name: 'Purple (Sector 4)' },
      { r: 255, g: 0, b: 128, name: 'Rose (Sector 5)' },
      // Custom palette colors
      { r: 12, g: 102, b: 228, name: 'Brand Blue' },
      { r: 239, g: 68, b: 68, name: 'Tailwind Red 500' },
      { r: 34, g: 197, b: 94, name: 'Tailwind Green 500' },
      { r: 59, g: 130, b: 246, name: 'Tailwind Blue 500' },
      { r: 168, g: 85, b: 247, name: 'Tailwind Purple 500' },
      { r: 249, g: 115, b: 22, name: 'Tailwind Orange 500' },
      { r: 15, g: 23, b: 42, name: 'Tailwind Slate 900' },
    ];

    for (const tc of testCases) {
      it(`matches mathematical oracle for ${tc.name} rgb(${tc.r}, ${tc.g}, ${tc.b})`, () => {
        const actual = rgbToHsl(tc.r, tc.g, tc.b);
        const expected = referenceRgbToHsl(tc.r, tc.g, tc.b);
        expect(actual.h).toBe(expected.h);
        expect(actual.s).toBe(expected.s);
        expect(actual.l).toBe(expected.l);
        expect(actual.css).toBe(`hsl(${expected.h}, ${expected.s}%, ${expected.l}%)`);
      });
    }

    it('matches mathematical oracle across 100 randomized RGB inputs', () => {
      for (let i = 0; i < 100; i++) {
        const r = Math.floor(Math.random() * 256);
        const g = Math.floor(Math.random() * 256);
        const b = Math.floor(Math.random() * 256);

        const actual = rgbToHsl(r, g, b);
        const expected = referenceRgbToHsl(r, g, b);

        expect(actual.h).toBe(expected.h);
        expect(actual.s).toBe(expected.s);
        expect(actual.l).toBe(expected.l);
      }
    });

    it('clamps out-of-range RGB arguments safely to [0, 255]', () => {
      const res = rgbToHsl(-100, 500, 255);
      // Clamped to r=0, g=255, b=255 (cyan)
      expect(res.h).toBe(180);
      expect(res.s).toBe(100);
      expect(res.l).toBe(50);
    });
  });

  describe('Fallback and Malformed Input Robustness', () => {
    const invalidInputs = [
      '',
      '   ',
      '#1',
      '#12',
      '#1234',
      '#12345',
      '#1234567',
      '#12345678',
      '#gggggg',
      '#ZZZ',
      'red',
      'blue',
      'rgb(0,0,0)',
      'hsl(0,0%,0%)',
      '#badhex!',
      'undefined',
      'null',
    ];

    for (const invalid of invalidInputs) {
      it(`falls back safely to #0C66E4 without throwing for "${invalid}"`, () => {
        const res = parseColor(invalid);
        expect(res.hex).toBe('#0C66E4');
        expect(res.rgb).toEqual({ r: 12, g: 102, b: 228, css: 'rgb(12, 102, 228)' });
        expect(res.hsl).toEqual({ h: 215, s: 90, l: 47, css: 'hsl(215, 90%, 47%)' });
      });
    }

    it('handles null and undefined safely without throwing', () => {
      const resNull = parseColor(null as any);
      expect(resNull.hex).toBe('#0C66E4');

      const resUndef = parseColor(undefined as any);
      expect(resUndef.hex).toBe('#0C66E4');
    });
  });
});

describe('M2 Adversarial Challenge: Theme LocalStorage Persistence', () => {
  const store: Record<string, string> = {};

  beforeEach(() => {
    Object.keys(store).forEach((k) => delete store[k]);
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, val: string) => {
        store[key] = String(val);
      }),
      removeItem: vi.fn((key: string) => {
        delete store[key];
      }),
      clear: vi.fn(() => {
        Object.keys(store).forEach((k) => delete store[k]);
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Emulate App.tsx lazy initializer
  function initThemeState(): 'light' | 'dark' {
    try {
      const saved = localStorage.getItem('lt-theme');
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {
      // ignore
    }
    return 'light';
  }

  // Emulate App.tsx useEffect([theme])
  function runThemeEffect(theme: 'light' | 'dark') {
    localStorage.setItem('lt-theme', theme);
  }

  it('preserves existing "dark" theme on initial mount without overwriting to "light"', () => {
    // PRE-CONDITION: User previously saved dark theme in localStorage
    localStorage.setItem('lt-theme', 'dark');
    expect(localStorage.getItem('lt-theme')).toBe('dark');

    // MOUNT: Lazy state initializer executes
    const initialTheme = initThemeState();
    expect(initialTheme).toBe('dark');

    // MOUNT EFFECT: useEffect([theme]) runs with initial theme
    runThemeEffect(initialTheme);

    // POST-CONDITION: localStorage MUST STILL BE 'dark', NOT overwritten to 'light'
    expect(localStorage.getItem('lt-theme')).toBe('dark');
  });

  it('preserves existing "light" theme on initial mount', () => {
    localStorage.setItem('lt-theme', 'light');
    const initialTheme = initThemeState();
    expect(initialTheme).toBe('light');
    runThemeEffect(initialTheme);
    expect(localStorage.getItem('lt-theme')).toBe('light');
  });

  it('defaults to "light" theme when localStorage is empty', () => {
    expect(localStorage.getItem('lt-theme')).toBeNull();
    const initialTheme = initThemeState();
    expect(initialTheme).toBe('light');
    runThemeEffect(initialTheme);
    expect(localStorage.getItem('lt-theme')).toBe('light');
  });

  it('falls back safely to "light" if localStorage contains invalid or corrupted theme value', () => {
    const corruptions = ['blue', 'DARK', 'LIGHT', '', '123', 'undefined', 'null', '{"theme":"dark"}'];
    for (const val of corruptions) {
      localStorage.setItem('lt-theme', val);
      const initialTheme = initThemeState();
      expect(initialTheme).toBe('light');
      runThemeEffect(initialTheme);
      // Validated theme is normalized to 'light'
      expect(localStorage.getItem('lt-theme')).toBe('light');
    }
  });

  it('handles localStorage.getItem throwing an exception gracefully', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => {
        throw new DOMException('SecurityError: The operation is insecure.');
      }),
      setItem: vi.fn(),
    });

    expect(() => {
      const initialTheme = initThemeState();
      expect(initialTheme).toBe('light');
    }).not.toThrow();
  });

  it('persists theme toggle transition across multiple simulated page reloads', () => {
    // Initial: First visit (no preference)
    expect(initThemeState()).toBe('light');
    runThemeEffect('light');
    expect(localStorage.getItem('lt-theme')).toBe('light');

    // User toggles to 'dark'
    let currentTheme: 'light' | 'dark' = 'dark';
    runThemeEffect(currentTheme);
    expect(localStorage.getItem('lt-theme')).toBe('dark');

    // Page Reload 1 (new component mount)
    let reloadedTheme = initThemeState();
    expect(reloadedTheme).toBe('dark');
    runThemeEffect(reloadedTheme);
    expect(localStorage.getItem('lt-theme')).toBe('dark');

    // User toggles back to 'light'
    currentTheme = 'light';
    runThemeEffect(currentTheme);
    expect(localStorage.getItem('lt-theme')).toBe('light');

    // Page Reload 2 (new component mount)
    reloadedTheme = initThemeState();
    expect(reloadedTheme).toBe('light');
    runThemeEffect(reloadedTheme);
    expect(localStorage.getItem('lt-theme')).toBe('light');
  });
});
