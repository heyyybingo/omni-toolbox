/** FLAC encode via libflacjs (WASM). Input: planar or mono/stereo float PCM. */
export async function encodeFlacFromChannels(
  channels: Float32Array[],
  sampleRate: number,
  opts: { compressionLevel?: number; bps?: 16 | 24 } = {}
): Promise<Uint8Array> {
  const libFactory = (await import('libflacjs')).default as unknown as (
    variant?: string
  ) => FlacApi;
  const Flac = libFactory('release.wasm');

  if (!Flac.is_ready()) {
    await new Promise<void>((resolve, reject) => {
      Flac.on('ready', () => resolve());
      setTimeout(() => reject(new Error('FLAC 初始化超时')), 15000);
    });
  }

  const numCh = Math.max(1, channels.length);
  const samples = channels[0]?.length || 0;
  const bps = opts.bps || 16;
  const compression = opts.compressionLevel ?? 5;

  // interleaved 32-bit samples
  const interleaved = new Int32Array(samples * numCh);
  const shift = 32 - bps;
  for (let i = 0; i < samples; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i] || 0));
      const v = s < 0 ? Math.round(s * (1 << (bps - 1))) : Math.round(s * ((1 << (bps - 1)) - 1));
      interleaved[i * numCh + c] = v << shift;
    }
  }

  const chunks: Uint8Array[] = [];
  const encoder = Flac.create_libflac_encoder(sampleRate, numCh, bps, compression, 0, true);
  if (!encoder) throw new Error('无法创建 FLAC 编码器');

  const writeCb = (buffer: Uint8Array) => {
    chunks.push(new Uint8Array(buffer));
  };
  const initStatus = Flac.init_encoder_stream(encoder, writeCb, () => undefined, false, 0);
  if (initStatus !== 0) {
    Flac.FLAC__stream_encoder_delete(encoder);
    throw new Error(`FLAC 初始化失败 (${initStatus})`);
  }

  const ok = Flac.FLAC__stream_encoder_process_interleaved(
    encoder,
    interleaved,
    samples
  );
  if (!ok) {
    Flac.FLAC__stream_encoder_delete(encoder);
    throw new Error('FLAC 编码失败');
  }
  Flac.FLAC__stream_encoder_finish(encoder);
  Flac.FLAC__stream_encoder_delete(encoder);

  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

type FlacApi = {
  is_ready: () => boolean;
  on: (event: string, cb: () => void) => void;
  create_libflac_encoder: (
    sampleRate: number,
    channels: number,
    bps: number,
    compression: number,
    totalSamples: number,
    verify: boolean
  ) => unknown;
  init_encoder_stream: (
    encoder: unknown,
    write: (buffer: Uint8Array) => void,
    metadata: (data: unknown) => void,
    ogg: boolean,
    unused: number
  ) => number;
  FLAC__stream_encoder_process_interleaved: (
    encoder: unknown,
    buffer: Int32Array,
    samples: number
  ) => boolean;
  FLAC__stream_encoder_finish: (encoder: unknown) => boolean;
  FLAC__stream_encoder_delete: (encoder: unknown) => void;
};
