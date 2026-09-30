/* Image worker: decode → OffscreenCanvas → encode. Keeps main thread free on batch jobs. */

self.onmessage = async (event) => {
  const { id, type, buffer, mime, quality, maxEdge, filename } = event.data || {};
  try {
    if (type === 'convert' || type === 'compress' || type === 'exif') {
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
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('OffscreenCanvas 2D unavailable');

      // White matte for formats without alpha
      if (mime === 'image/jpeg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
      }
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();

      const q = typeof quality === 'number' ? Math.min(1, Math.max(0.1, quality)) : 0.92;
      const outBlob = await canvas.convertToBlob({ type: mime, quality: q });
      const outBuffer = await outBlob.arrayBuffer();

      self.postMessage({
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
      }, [outBuffer]);
      return;
    }

    throw new Error(`Unknown image job: ${type}`);
  } catch (err) {
    self.postMessage({
      id,
      ok: false,
      error: err && err.message ? err.message : String(err),
      filename,
    });
  }
};
