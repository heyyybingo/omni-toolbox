import { useEffect, useRef, useState } from 'react';

type Props = {
  file: File;
  start: number;
  end: number;
  onChange: (start: number, end: number) => void;
};

/** Waveform with reliable pointer-capture trim handles. */
export function WaveformTrim({ file, start, end, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [duration, setDuration] = useState(0);
  const [peaks, setPeaks] = useState<number[]>([]);
  const dragRef = useRef<'start' | 'end' | null>(null);
  const stateRef = useRef({ start, end, duration });
  stateRef.current = { start, end, duration };
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const buf = await file.arrayBuffer();
      const ctx = new AudioContext();
      try {
        const audio = await ctx.decodeAudioData(buf);
        if (cancelled) return;
        setDuration(audio.duration);
        const ch = audio.getChannelData(0);
        const N = 280;
        const block = Math.floor(ch.length / N) || 1;
        const arr: number[] = [];
        for (let i = 0; i < N; i++) {
          let max = 0;
          const s = i * block;
          for (let j = 0; j < block; j += 4) {
            const v = Math.abs(ch[s + j] || 0);
            if (v > max) max = v;
          }
          arr.push(max);
        }
        setPeaks(arr);
        if (!end || end <= start) changeRef.current(0, audio.duration);
      } finally {
        void ctx.close();
      }
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks.length) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 600;
    const h = 96;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const n = peaks.length;
    const barW = w / n;
    const s0 = duration ? start / duration : 0;
    const s1 = duration ? end / duration : 1;
    for (let i = 0; i < n; i++) {
      const p = i / n;
      const inRange = p >= s0 && p <= s1;
      const bh = Math.max(2, peaks[i] * (h - 12));
      ctx.fillStyle = inRange ? '#5b6cfa' : '#c5c7cc';
      ctx.fillRect(i * barW, (h - bh) / 2, Math.max(1, barW - 1), bh);
    }
  }, [peaks, start, end, duration]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const mode = dragRef.current;
      const { start: s, end: ed, duration: d } = stateRef.current;
      if (!mode || !d || !wrapRef.current) return;
      e.preventDefault();
      const rect = wrapRef.current.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const t = p * d;
      if (mode === 'start') {
        changeRef.current(Math.min(t, ed - 0.05), ed);
      } else {
        changeRef.current(s, Math.max(t, s + 0.05));
      }
    };
    const up = (e: PointerEvent) => {
      if (!dragRef.current) return;
      dragRef.current = null;
      try {
        (e.target as HTMLElement)?.releasePointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);

  const pct = (t: number) => (duration ? (t / duration) * 100 : 0);

  const startDrag = (mode: 'start' | 'end') => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = mode;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  return (
    <div ref={wrapRef} className="relative h-24 w-full touch-none select-none rounded-md border border-border bg-muted/30">
      <canvas ref={canvasRef} className="h-full w-full" />
      <div
        className="absolute inset-y-0 border-x-2 border-primary bg-primary/10"
        style={{ left: `${pct(start)}%`, width: `${Math.max(0.5, pct(end) - pct(start))}%` }}
      />
      <div
        role="slider"
        aria-label="开始时间"
        aria-valuenow={Math.round(start * 100) / 100}
        tabIndex={0}
        className="absolute inset-y-0 w-3.5 -translate-x-1/2 cursor-ew-resize rounded bg-primary shadow"
        style={{ left: `${pct(start)}%` }}
        onPointerDown={startDrag('start')}
      />
      <div
        role="slider"
        aria-label="结束时间"
        aria-valuenow={Math.round(end * 100) / 100}
        tabIndex={0}
        className="absolute inset-y-0 w-3.5 -translate-x-1/2 cursor-ew-resize rounded bg-primary shadow"
        style={{ left: `${pct(end)}%` }}
        onPointerDown={startDrag('end')}
      />
      <div className="pointer-events-none absolute bottom-1 left-2 font-mono text-[11px] text-muted-foreground">
        {start.toFixed(2)}s — {end.toFixed(2)}s · 共 {duration.toFixed(1)}s
      </div>
    </div>
  );
}

/** Video timeline (no waveform) with the same handle interaction. */
export function TimelineTrim({
  duration,
  start,
  end,
  onChange,
}: {
  duration: number;
  start: number;
  end: number;
  onChange: (start: number, end: number) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<'start' | 'end' | null>(null);
  const stateRef = useRef({ start, end, duration });
  stateRef.current = { start, end, duration };
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const mode = dragRef.current;
      const { start: s, end: ed, duration: d } = stateRef.current;
      if (!mode || !d || !wrapRef.current) return;
      e.preventDefault();
      const rect = wrapRef.current.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const t = p * d;
      if (mode === 'start') changeRef.current(Math.min(t, ed - 0.1), ed);
      else changeRef.current(s, Math.max(t, s + 0.1));
    };
    const up = () => {
      dragRef.current = null;
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', up);
    };
  }, []);

  const pct = (t: number) => (duration ? (t / duration) * 100 : 0);
  const startDrag = (mode: 'start' | 'end') => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = mode;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  return (
    <div ref={wrapRef} className="relative h-12 w-full touch-none select-none rounded-md border border-border bg-muted">
      <div
        className="absolute inset-y-0 border-x-2 border-primary bg-primary/15"
        style={{ left: `${pct(start)}%`, width: `${Math.max(0.5, pct(end) - pct(start))}%` }}
      />
      <div
        role="slider"
        aria-label="开始时间"
        tabIndex={0}
        className="absolute inset-y-0 w-3.5 -translate-x-1/2 cursor-ew-resize rounded bg-primary shadow"
        style={{ left: `${pct(start)}%` }}
        onPointerDown={startDrag('start')}
      />
      <div
        role="slider"
        aria-label="结束时间"
        tabIndex={0}
        className="absolute inset-y-0 w-3.5 -translate-x-1/2 cursor-ew-resize rounded bg-primary shadow"
        style={{ left: `${pct(end)}%` }}
        onPointerDown={startDrag('end')}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-1 text-center font-mono text-[11px] text-muted-foreground">
        {start.toFixed(1)}s — {end.toFixed(1)}s · {duration.toFixed(1)}s
      </div>
    </div>
  );
}
