import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Loose tool search: substring, char-subsequence (fuzzy), and token match. */
export function fuzzyMatch(query: string, text: string): boolean {
  const q = query.trim().toLowerCase();
  const t = text.toLowerCase();
  if (!q) return true;
  if (t.includes(q)) return true;

  // space-separated tokens: each must match somewhere
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    return tokens.every((tok) => fuzzyMatch(tok, text));
  }

  // subsequence: "pdfwm" matches "PDF 水印"
  let i = 0;
  for (const ch of t) {
    if (ch === q[i]) i += 1;
    if (i >= q.length) return true;
  }
  return false;
}

export function toolSearchScore(query: string, fields: string[]): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const joined = fields.join(' ').toLowerCase();
  if (!fuzzyMatch(q, joined)) return 0;
  let score = 0;
  for (const f of fields) {
    const s = f.toLowerCase();
    if (s === q) score = Math.max(score, 100);
    else if (s.startsWith(q)) score = Math.max(score, 80);
    else if (s.includes(q)) score = Math.max(score, 60);
  }
  if (score === 0 && fuzzyMatch(q, joined)) score = 20;
  return score;
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function baseName(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(0, i) : name;
}

export function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toUpperCase().slice(0, 4) : 'FILE';
}

export function uniqueName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
  const stem = ext ? name.slice(0, name.lastIndexOf('.')) : name;
  let n = 2;
  while (used.has(`${stem}-${n}${ext}`)) n += 1;
  const next = `${stem}-${n}${ext}`;
  used.add(next);
  return next;
}

export function parsePageRange(rangeStr: string | null | undefined, pageCount: number): number[] {
  const text = (rangeStr || '').trim();
  if (!text) return Array.from({ length: Math.max(0, pageCount) }, (_, i) => i);
  if (pageCount <= 0) throw new Error('页码范围无效');

  const pages = new Set<number>();
  for (const part of text.split(',')) {
    const piece = part.trim();
    if (!piece) continue;

    if (piece.includes('-')) {
      const parts = piece.split('-');
      if (parts.length !== 2) throw new Error('页码范围无效');

      const aRaw = parts[0].trim();
      const bRaw = parts[1].trim();

      let start: number;
      let end: number;

      if (!aRaw && !bRaw) {
        // '-' covers all pages
        start = 1;
        end = pageCount;
      } else if (!aRaw) {
        // '-N'
        if (!/^\d+$/.test(bRaw)) throw new Error('页码范围无效');
        start = 1;
        end = parseInt(bRaw, 10);
      } else if (!bRaw) {
        // 'A-'
        if (!/^\d+$/.test(aRaw)) throw new Error('页码范围无效');
        start = parseInt(aRaw, 10);
        end = pageCount;
      } else {
        // 'A-B'
        if (!/^\d+$/.test(aRaw) || !/^\d+$/.test(bRaw)) throw new Error('页码范围无效');
        const a = parseInt(aRaw, 10);
        const b = parseInt(bRaw, 10);
        start = Math.min(a, b);
        end = Math.max(a, b);
      }

      const clampedStart = Math.max(1, start);
      const clampedEnd = Math.min(pageCount, end);
      for (let p = clampedStart; p <= clampedEnd; p++) {
        pages.add(p - 1);
      }
    } else {
      if (!/^\d+$/.test(piece)) throw new Error('页码范围无效');
      const p = parseInt(piece, 10);
      if (p >= 1 && p <= pageCount) {
        pages.add(p - 1);
      }
    }
  }

  if (!pages.size) throw new Error('页码范围无效');
  return [...pages].sort((a, b) => a - b);
}

export function luhnValid(numStr: string): boolean {
  const s = String(numStr || '').replace(/\s+/g, '');
  if (!/^\d{13,19}$/.test(s)) return false;
  let sum = 0;
  let alt = false;
  for (let i = s.length - 1; i >= 0; i--) {
    let d = s.charCodeAt(i) - 48;
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function idCardChecksumValid(numStr: string): boolean {
  const s = String(numStr || '').trim().toUpperCase();
  if (!/^\d{17}[\dX]$/.test(s)) return false;
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const codes = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += (s.charCodeAt(i) - 48) * weights[i];
  return codes[sum % 11] === s[17];
}

export function parseJsonSafe(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function formatJson(text: string, indent = 2) {
  const parsed = parseJsonSafe(text);
  if (!parsed.ok) return parsed;
  return { ok: true as const, value: JSON.stringify(parsed.value, null, indent) };
}

export function minifyJson(text: string) {
  const parsed = parseJsonSafe(text);
  if (!parsed.ok) return parsed;
  return { ok: true as const, value: JSON.stringify(parsed.value) };
}

export function createZip(files: { name: string; data: Uint8Array }[]): Blob {
  const encoder = new TextEncoder();
  const chunks: BlobPart[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c >>> 0;
    }
    return table;
  })();

  const crc32 = (buf: Uint8Array) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const data = file.data;
    const crc = crc32(data);

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    chunks.push(local as unknown as BlobPart, data as unknown as BlobPart);

    const cen = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    cen.set(nameBytes, 46);
    central.push(cen);
    offset += local.length + data.length;
  }

  const centralStart = offset;
  let centralSize = 0;
  for (const c of central) {
    chunks.push(c as unknown as BlobPart);
    centralSize += c.length;
  }

  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, centralStart, true);
  chunks.push(end);

  return new Blob(chunks, { type: 'application/zip' });
}

export function encodeWavFromChannels(
  channels: Float32Array[],
  sampleRate: number,
  bitDepth: 16 | 24 | 32 = 16
): ArrayBuffer {
  const numChannels = channels.length;
  const samples = channels[0]?.length || 0;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = samples * blockAlign;
  const isFloat = bitDepth === 32;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, isFloat ? 3 : 1, true); // IEEE float vs PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples; i++) {
    for (let c = 0; c < numChannels; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i] || 0));
      if (bitDepth === 32) {
        view.setFloat32(offset, s, true);
        offset += 4;
      } else if (bitDepth === 24) {
        const v = Math.round(s < 0 ? s * 0x800000 : s * 0x7fffff);
        view.setUint8(offset, v & 0xff);
        view.setUint8(offset + 1, (v >> 8) & 0xff);
        view.setUint8(offset + 2, (v >> 16) & 0xff);
        offset += 3;
      } else {
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        offset += 2;
      }
    }
  }
  return buffer;
}

export function jsonToCsv(value: unknown, delimiter = ','): string {
  const rows = Array.isArray(value) ? value : [value];
  const keySet = new Set<string>();
  for (const row of rows) {
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      for (const k of Object.keys(row as object)) keySet.add(k);
    }
  }
  const keys = [...keySet];
  const esc = (v: unknown) => {
    const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    const needQuote = s.includes('"') || s.includes(delimiter) || s.includes('\n') || s.includes('\r');
    return needQuote ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const lines = [keys.map(esc).join(delimiter)];
  for (const row of rows) {
    const obj = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
    lines.push(keys.map((k) => esc(obj[k])).join(delimiter));
  }
  return lines.join('\n');
}

export function csvToJson(csv: string, delimiter = ','): unknown[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length);
  if (!lines.length) return [];
  const parseLine = (line: string) => {
    const out: string[] = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === delimiter) {
        out.push(cur);
        cur = '';
      } else cur += ch;
    }
    out.push(cur);
    return out;
  };
  const headers = parseLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = cells[i] ?? '';
    });
    return obj;
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Calculates visible tabs and overflow tabs based on container capacity.
 * Ensures the active tab always remains in the visible set.
 */
export function computeTabSlices(tabOrder: string[], visibleCount: number, activeId: string) {
  if (tabOrder.length <= visibleCount) {
    return { visibleTabs: tabOrder, overflowTabs: [] as string[] };
  }

  const activeIdx = tabOrder.indexOf(activeId);
  if (activeIdx < visibleCount) {
    return {
      visibleTabs: tabOrder.slice(0, visibleCount),
      overflowTabs: tabOrder.slice(visibleCount),
    };
  }

  const head = tabOrder.slice(0, Math.max(1, visibleCount - 1));
  const visible = [...head, activeId];
  const visibleSet = new Set(visible);
  const overflow = tabOrder.filter((id) => !visibleSet.has(id));

  return {
    visibleTabs: visible,
    overflowTabs: overflow,
  };
}
