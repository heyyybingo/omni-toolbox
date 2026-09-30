/// <reference lib="webworker" />
import {
  mergePdfs,
  rotatePdf,
  splitPdf,
  watermarkPdfBitmap,
  renderWatermarkPng,
} from '../engine/pdf-ops';

type PdfJob = {
  id: string;
  type: 'merge' | 'split' | 'rotate' | 'watermark';
  payload: {
    buffer?: ArrayBuffer;
    files?: { name: string; buffer: ArrayBuffer }[];
    range?: string;
    angle?: number;
    text?: string;
    size?: number;
    opacity?: number;
    color?: string;
    bold?: boolean;
    mode?: 'single' | 'tile';
    gapX?: number;
    gapY?: number;
  };
};

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (event: MessageEvent<PdfJob>) => {
  const { id, type, payload } = event.data || ({} as PdfJob);
  try {
    let outBuffer: Uint8Array;

    if (type === 'merge') {
      outBuffer = await mergePdfs((payload.files || []).map((f) => f.buffer));
    } else if (type === 'split') {
      if (!payload.buffer) throw new Error('缺少 PDF');
      outBuffer = await splitPdf(payload.buffer, payload.range || '');
    } else if (type === 'rotate') {
      if (!payload.buffer) throw new Error('缺少 PDF');
      outBuffer = await rotatePdf(payload.buffer, payload.angle || 90);
    } else if (type === 'watermark') {
      if (!payload.buffer) throw new Error('缺少 PDF');
      const text = payload.text || 'WATERMARK';
      const imageBytes = await renderWatermarkPng(text, {
        size: payload.size || 42,
        angle: payload.angle ?? 32,
        color: payload.color,
        bold: payload.bold,
      });
      outBuffer = await watermarkPdfBitmap(payload.buffer, text, {
        size: payload.size,
        opacity: payload.opacity,
        angle: payload.angle,
        imageBytes,
        mode: payload.mode,
        gapX: payload.gapX,
        gapY: payload.gapY,
      });
    } else {
      throw new Error(`Unknown pdf job: ${type}`);
    }

    const ab = outBuffer.buffer.slice(
      outBuffer.byteOffset,
      outBuffer.byteOffset + outBuffer.byteLength
    ) as ArrayBuffer;
    ctx.postMessage({ id, ok: true, result: { buffer: ab, size: ab.byteLength } }, [ab]);
  } catch (err) {
    ctx.postMessage({
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
