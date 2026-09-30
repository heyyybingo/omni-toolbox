import YAML from 'yaml';
import * as Diff from 'diff';
import ExifReader from 'exifreader';
import type { JobResult } from '@/engine/jobs';

// ==========================================
// 1. JSON ↔ YAML
// ==========================================

export function jsonToYaml(jsonStr: string, indent = 2): { yaml: string; error?: string } {
  try {
    const parsed = JSON.parse(jsonStr);
    const yaml = YAML.stringify(parsed, { indent });
    return { yaml };
  } catch (err) {
    return { yaml: '', error: err instanceof Error ? err.message : String(err) };
  }
}

export function yamlToJson(yamlStr: string, indent = 2): { json: string; error?: string } {
  try {
    const parsed = YAML.parse(yamlStr);
    const json = JSON.stringify(parsed, null, indent);
    return { json };
  } catch (err) {
    return { json: '', error: err instanceof Error ? err.message : String(err) };
  }
}

// ==========================================
// 2. JSON → TypeScript Interface / Type
// ==========================================

export interface JsonToTsOptions {
  rootName?: string;
  useTypeAlias?: boolean;
  exportPrefix?: boolean;
  readonlyFields?: boolean;
}

export function jsonToTypeScript(
  jsonStr: string,
  options: JsonToTsOptions = {}
): { code: string; error?: string } {
  try {
    const parsed = JSON.parse(jsonStr);
    const rootName = (options.rootName || 'RootObject').replace(/[^a-zA-Z0-9_]/g, '') || 'RootObject';
    const interfaces: Map<string, string> = new Map();

    const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    const sanitizeKey = (key: string) => (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : JSON.stringify(key));

    function getType(val: unknown, keyHint: string): string {
      if (val === null) return 'null';
      if (val === undefined) return 'undefined';
      if (typeof val === 'string') return 'string';
      if (typeof val === 'number') return 'number';
      if (typeof val === 'boolean') return 'boolean';

      if (Array.isArray(val)) {
        if (val.length === 0) return 'any[]';
        const itemTypes = Array.from(new Set(val.map((item) => getType(item, `${keyHint}Item`))));
        if (itemTypes.length === 1) {
          const t = itemTypes[0];
          return t.includes(' ') ? `(${t})[]` : `${t}[]`;
        }
        return `(${itemTypes.join(' | ')})[]`;
      }

      if (typeof val === 'object') {
        const typeName = capitalize(keyHint);
        generateInterface(val as Record<string, unknown>, typeName);
        return typeName;
      }

      return 'any';
    }

    function generateInterface(obj: Record<string, unknown>, typeName: string): void {
      if (interfaces.has(typeName)) return;

      const lines: string[] = [];
      const prefix = options.exportPrefix ? 'export ' : '';
      const readonlyPrefix = options.readonlyFields ? 'readonly ' : '';

      for (const [k, v] of Object.entries(obj)) {
        const propName = sanitizeKey(k);
        const propType = getType(v, `${typeName}_${k}`);
        lines.push(`  ${readonlyPrefix}${propName}: ${propType};`);
      }

      const body = lines.join('\n');
      const declaration = options.useTypeAlias
        ? `${prefix}type ${typeName} = {\n${body}\n};`
        : `${prefix}interface ${typeName} {\n${body}\n}`;

      interfaces.set(typeName, declaration);
    }

    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      generateInterface(parsed as Record<string, unknown>, rootName);
    } else if (Array.isArray(parsed)) {
      const elemType = getType(parsed[0], `${rootName}Item`);
      const prefix = options.exportPrefix ? 'export ' : '';
      const decl = `${prefix}type ${rootName} = ${elemType.includes(' ') ? `(${elemType})[]` : `${elemType}[]`};`;
      interfaces.set(rootName, decl);
    } else {
      const prefix = options.exportPrefix ? 'export ' : '';
      interfaces.set(rootName, `${prefix}type ${rootName} = ${typeof parsed};`);
    }

    // Sort declarations so child types appear before or cleanly ordered
    const declarations = Array.from(interfaces.values()).reverse();
    return { code: declarations.join('\n\n') };
  } catch (err) {
    return { code: '', error: err instanceof Error ? err.message : String(err) };
  }
}

// ==========================================
// 3. Text / JSON Diff
// ==========================================

export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  value: string;
  leftLine?: number;
  rightLine?: number;
}

export function computeTextDiff(
  leftText: string,
  rightText: string,
  mode: 'lines' | 'words' = 'lines'
): {
  diffs: Diff.Change[];
  lines: DiffLine[];
  stats: { added: number; removed: number; unchanged: number };
} {
  const changes = mode === 'words' ? Diff.diffWords(leftText, rightText) : Diff.diffLines(leftText, rightText);

  let leftCount = 1;
  let rightCount = 1;
  const lines: DiffLine[] = [];
  const stats = { added: 0, removed: 0, unchanged: 0 };

  for (const part of changes) {
    const rawLines = part.value.replace(/\r\n/g, '\n').split('\n');
    if (rawLines[rawLines.length - 1] === '') rawLines.pop();

    for (const line of rawLines) {
      if (part.added) {
        stats.added++;
        lines.push({ type: 'added', value: line, rightLine: rightCount++ });
      } else if (part.removed) {
        stats.removed++;
        lines.push({ type: 'removed', value: line, leftLine: leftCount++ });
      } else {
        stats.unchanged++;
        lines.push({ type: 'unchanged', value: line, leftLine: leftCount++, rightLine: rightCount++ });
      }
    }
  }

  return { diffs: changes, lines, stats };
}

// ==========================================
// 4. Regular Expression Tester
// ==========================================

export interface RegexMatchItem {
  index: number;
  length: number;
  text: string;
  groups: string[];
}

export function testRegex(
  pattern: string,
  flags: string,
  testText: string,
  replacement?: string
): {
  matches: RegexMatchItem[];
  replacedText?: string;
  error?: string;
} {
  if (!pattern) {
    return { matches: [], replacedText: testText };
  }

  try {
    const effectiveFlags = flags.includes('g') ? flags : `${flags}g`;
    const regex = new RegExp(pattern, effectiveFlags);
    const matches: RegexMatchItem[] = [];
    let match: RegExpExecArray | null = null;
    let iterations = 0;
    const maxIterations = 500; // Protection against runaway loops

    while ((match = regex.exec(testText)) !== null) {
      matches.push({
        index: match.index,
        length: match[0].length,
        text: match[0],
        groups: match.slice(1).map((g) => g ?? ''),
      });

      if (match[0].length === 0) {
        regex.lastIndex++;
      }

      if (++iterations >= maxIterations) break;
    }

    let replacedText: string | undefined;
    if (replacement !== undefined) {
      const repRegex = new RegExp(pattern, flags);
      replacedText = testText.replace(repRegex, replacement);
    }

    return { matches, replacedText };
  } catch (err) {
    return { matches: [], error: err instanceof Error ? err.message : String(err) };
  }
}

// ==========================================
// 5. Favicon / Multi-size Icon Generator
// ==========================================

export interface FaviconSpec {
  name: string;
  size: number;
  mime: string;
}

export const FAVICON_SPECS: FaviconSpec[] = [
  { name: 'favicon-16x16.png', size: 16, mime: 'image/png' },
  { name: 'favicon-32x32.png', size: 32, mime: 'image/png' },
  { name: 'favicon-48x48.png', size: 48, mime: 'image/png' },
  { name: 'apple-touch-icon.png', size: 180, mime: 'image/png' },
  { name: 'android-chrome-192x192.png', size: 192, mime: 'image/png' },
  { name: 'android-chrome-512x512.png', size: 512, mime: 'image/png' },
];

/** Build a multi-resolution ICO file from PNG buffers (16x16, 32x32, 48x48). */
export function buildIcoFile(pngs: { size: number; buffer: ArrayBuffer }[]): Blob {
  const count = pngs.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  let offset = headerSize + count * dirEntrySize;

  const totalSize = offset + pngs.reduce((sum, p) => sum + p.buffer.byteLength, 0);
  const icoBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(icoBuffer);
  const uint8 = new Uint8Array(icoBuffer);

  // ICONDIR header
  view.setUint16(0, 0, true); // Reserved
  view.setUint16(2, 1, true); // Type (1 = ICO)
  view.setUint16(4, count, true); // Number of images

  // Directory entries
  pngs.forEach((png, i) => {
    const entryOffset = headerSize + i * dirEntrySize;
    const width = png.size >= 256 ? 0 : png.size;
    const height = png.size >= 256 ? 0 : png.size;

    view.setUint8(entryOffset + 0, width);
    view.setUint8(entryOffset + 1, height);
    view.setUint8(entryOffset + 2, 0); // Color palette
    view.setUint8(entryOffset + 3, 0); // Reserved
    view.setUint16(entryOffset + 4, 1, true); // Color planes
    view.setUint16(entryOffset + 6, 32, true); // Bits per pixel
    view.setUint32(entryOffset + 8, png.buffer.byteLength, true); // Image size in bytes
    view.setUint32(entryOffset + 12, offset, true); // Offset of image data

    // Copy PNG data
    uint8.set(new Uint8Array(png.buffer), offset);
    offset += png.buffer.byteLength;
  });

  return new Blob([icoBuffer], { type: 'image/x-icon' });
}

export async function generateFaviconPackage(file: File): Promise<JobResult[]> {
  const imgBitmap = await createImageBitmap(file);
  const results: JobResult[] = [];
  const icoPngSources: { size: number; buffer: ArrayBuffer }[] = [];

  for (const spec of FAVICON_SPECS) {
    const canvas = document.createElement('canvas');
    canvas.width = spec.size;
    canvas.height = spec.size;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(imgBitmap, 0, 0, spec.size, spec.size);

    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b || new Blob()), 'image/png')
    );
    const ab = await blob.arrayBuffer();

    results.push({
      blob,
      name: spec.name,
      size: blob.size,
      inputSize: file.size,
    });

    if ([16, 32, 48].includes(spec.size)) {
      icoPngSources.push({ size: spec.size, buffer: ab });
    }
  }

  // Generate multi-size favicon.ico
  if (icoPngSources.length > 0) {
    const icoBlob = buildIcoFile(icoPngSources);
    results.push({
      blob: icoBlob,
      name: 'favicon.ico',
      size: icoBlob.size,
      inputSize: file.size,
    });
  }

  // Generate site.webmanifest
  const manifest = {
    name: 'App',
    short_name: 'App',
    icons: [
      { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    theme_color: '#ffffff',
    background_color: '#ffffff',
    display: 'standalone',
  };
  const manifestBlob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
  results.push({
    blob: manifestBlob,
    name: 'site.webmanifest',
    size: manifestBlob.size,
    inputSize: file.size,
  });

  // Generate HTML header snippet
  const htmlSnippet = `<!-- Favicon & App Icons -->
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
`;
  const htmlBlob = new Blob([htmlSnippet], { type: 'text/html' });
  results.push({
    blob: htmlBlob,
    name: 'html_tags.html',
    size: htmlBlob.size,
    inputSize: file.size,
  });

  return results;
}

// ==========================================
// 6. EXIF Metadata Inspector
// ==========================================

export interface ParsedExifData {
  device: {
    make?: string;
    model?: string;
    lens?: string;
    software?: string;
  };
  exposure: {
    fNumber?: string;
    exposureTime?: string;
    iso?: string;
    focalLength?: string;
    focalLength35mm?: string;
    flash?: string;
    meteringMode?: string;
    exposureProgram?: string;
    whiteBalance?: string;
  };
  image: {
    width?: number;
    height?: number;
    dateOriginal?: string;
    dateModified?: string;
    colorSpace?: string;
    orientation?: string;
  };
  gps?: {
    latitude?: number;
    longitude?: number;
    altitude?: string;
    mapUrl?: string;
  };
  allTags: Record<string, string>;
}

export async function parseImageExif(file: File): Promise<ParsedExifData> {
  const buffer = await file.arrayBuffer();
  const tags = ExifReader.load(buffer, { expanded: true });

  const getStr = (val: unknown): string | undefined => {
    if (!val) return undefined;
    if (typeof val === 'object' && 'description' in (val as Record<string, unknown>)) {
      return String((val as { description: unknown }).description);
    }
    return String(val);
  };

  const getNum = (val: unknown): number | undefined => {
    if (!val) return undefined;
    if (typeof val === 'object' && 'value' in (val as Record<string, unknown>)) {
      const v = (val as { value: unknown }).value;
      if (typeof v === 'number') return v;
      if (typeof v === 'string') return parseFloat(v);
    }
    if (typeof val === 'number') return val;
    return undefined;
  };

  const anyTags = tags as Record<string, any>;
  const exif = anyTags.exif || {};
  const iptc = anyTags.iptc || {};
  const xmp = anyTags.xmp || {};
  const fileTags = anyTags.file || {};

  const make = getStr(exif.Make) || getStr(anyTags.Make);
  const model = getStr(exif.Model) || getStr(anyTags.Model);
  const lens = getStr(exif.LensModel) || getStr(anyTags.LensModel) || getStr(xmp.LensModel);
  const software = getStr(exif.Software) || getStr(anyTags.Software);

  const fNumber = getStr(exif.FNumber);
  const exposureTime = getStr(exif.ExposureTime);
  const iso = getStr(exif.ISOSpeedRatings) || getStr(exif.PhotographicSensitivity);
  const focalLength = getStr(exif.FocalLength);
  const focalLength35mm = getStr(exif.FocalLengthIn35mmFilm);
  const flash = getStr(exif.Flash);
  const meteringMode = getStr(exif.MeteringMode);
  const exposureProgram = getStr(exif.ExposureProgram);
  const whiteBalance = getStr(exif.WhiteBalance);

  const width = getNum(fileTags['Image Width']) || getNum(exif.PixelXDimension) || getNum(anyTags.ImageWidth);
  const height = getNum(fileTags['Image Height']) || getNum(exif.PixelYDimension) || getNum(anyTags.ImageLength);
  const dateOriginal = getStr(exif.DateTimeOriginal) || getStr(anyTags.DateTimeOriginal) || getStr(xmp.CreateDate);
  const dateModified = getStr(exif.DateTime) || getStr(anyTags.DateTime);
  const colorSpace = getStr(exif.ColorSpace);
  const orientation = getStr(exif.Orientation) || getStr(anyTags.Orientation);

  let gpsData: ParsedExifData['gps'] | undefined;
  if (tags.gps && tags.gps.Latitude && tags.gps.Longitude) {
    const lat = typeof tags.gps.Latitude === 'number' ? tags.gps.Latitude : parseFloat(String(tags.gps.Latitude));
    const lon = typeof tags.gps.Longitude === 'number' ? tags.gps.Longitude : parseFloat(String(tags.gps.Longitude));
    const alt = getStr(tags.gps.Altitude);
    gpsData = {
      latitude: lat,
      longitude: lon,
      altitude: alt,
      mapUrl: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`,
    };
  }

  const allTags: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...fileTags, ...exif, ...iptc, ...xmp })) {
    const desc = getStr(v);
    if (desc) allTags[k] = desc;
  }

  return {
    device: { make, model, lens, software },
    exposure: { fNumber, exposureTime, iso, focalLength, focalLength35mm, flash, meteringMode, exposureProgram, whiteBalance },
    image: { width, height, dateOriginal, dateModified, colorSpace, orientation },
    gps: gpsData,
    allTags,
  };
}
