/// <reference lib="webworker" />

type ImageJob = {
  id: string;
  type: 'convert' | 'compress' | 'exif';
  buffer: ArrayBuffer;
  mime: string;
  quality?: number;
  maxEdge?: number;
  filename?: string;
};

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (event: MessageEvent<ImageJob>) => {
  const { id, type, buffer, mime, quality, maxEdge, filename } = event.data || ({} as ImageJob);
  try {
    if (type !== 'convert' && type !== 'compress' && type !== 'exif') {
      throw new Error(`Unknown image job: ${type}`);
    }
    const blob = new Blob([buffer]);
    const bitmap = await createImageBitmap(blob);

    let width = bitmap.width;
    let height = bitmap.height;
    if (maxEdge && maxEdge > 0) {
      const scale = Math.min(1, maxEdge / Math.max(width, height));
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
    }

    const canvas = new OffscreenCanvas(width, height);
    const c2d = canvas.getContext('2d');
    if (!c2d) throw new Error('OffscreenCanvas 2D unavailable');
    if (mime === 'image/jpeg') {
      c2d.fillStyle = '#ffffff';
      c2d.fillRect(0, 0, width, height);
    }
    c2d.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const q = typeof quality === 'number' ? Math.min(1, Math.max(0.1, quality)) : 0.92;
    const outBlob = await canvas.convertToBlob({ type: mime, quality: q });
    const outBuffer = await outBlob.arrayBuffer();

    ctx.postMessage(
      {
        id,
        ok: true,
        result: {
          buffer: outBuffer,
          mime,
          width,
          height,
          size: outBuffer.byteLength,
          filename,
        },
      },
      [outBuffer]
    );
  } catch (err) {
    ctx.postMessage({
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      filename,
    });
  }
};
