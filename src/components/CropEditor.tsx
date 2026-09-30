import { useCallback, useEffect, useRef, useState } from 'react';

export type CropRect = { x: number; y: number; w: number; h: number };

type Props = {
  file: File;
  value: CropRect;
  onChange: (rect: CropRect) => void;
};

/**
 * Visual crop over the image.
 * Crop rect is always in **natural (original) pixels**.
 * Pointer math uses the actual rendered image box (object-contain aware).
 */
export function CropEditor({ file, value, onChange }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [imgUrl, setImgUrl] = useState('');
  const [drag, setDrag] = useState<
    | { mode: 'move' | 'nw' | 'ne' | 'sw' | 'se'; startX: number; startY: number; orig: CropRect }
    | null
  >(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    const img = new Image();
    img.onload = () => {
      setNatural({ w: img.naturalWidth, h: img.naturalHeight });
      // default crop: center 60% of *original* pixels
      if (!value.w || !value.h) {
        const w = Math.round(img.naturalWidth * 0.6);
        const h = Math.round(img.naturalHeight * 0.6);
        onChange({
          x: Math.round((img.naturalWidth - w) / 2),
          y: Math.round((img.naturalHeight - h) / 2),
          w,
          h,
        });
      }
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  /** Rendered content box of the <img> inside its container (object-contain). */
  const displayRect = useCallback(() => {
    const box = boxRef.current;
    const img = imgRef.current;
    if (!box || !img || !natural) {
      return { left: 0, top: 0, width: 1, height: 1, scale: 1 };
    }
    const boxW = box.clientWidth;
    const boxH = box.clientHeight;
    const scale = Math.min(boxW / natural.w, boxH / natural.h);
    const width = natural.w * scale;
    const height = natural.h * scale;
    const left = (boxW - width) / 2;
    const top = (boxH - height) / 2;
    return { left, top, width, height, scale };
  }, [natural]);

  const toDisplay = (r: CropRect) => {
    const d = displayRect();
    return {
      left: d.left + r.x * d.scale,
      top: d.top + r.y * d.scale,
      width: r.w * d.scale,
      height: r.h * d.scale,
    };
  };

  const onPointerDown = (mode: 'move' | 'nw' | 'ne' | 'sw' | 'se') => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrag({ mode, startX: e.clientX, startY: e.clientY, orig: { ...value } });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag || !natural) return;
    const d = displayRect();
    const dx = (e.clientX - drag.startX) / d.scale;
    const dy = (e.clientY - drag.startY) / d.scale;
    const o = drag.orig;
    let next: CropRect;

    if (drag.mode === 'move') {
      const x = Math.min(Math.max(0, o.x + dx), natural.w - o.w);
      const y = Math.min(Math.max(0, o.y + dy), natural.h - o.h);
      next = { x: Math.round(x), y: Math.round(y), w: o.w, h: o.h };
    } else {
      let x = o.x;
      let y = o.y;
      let w = o.w;
      let h = o.h;
      if (drag.mode.includes('n')) {
        const ny = Math.min(o.y + dy, o.y + o.h - 20);
        h = o.h + (o.y - ny);
        y = ny;
      }
      if (drag.mode.includes('s')) h = o.h + dy;
      if (drag.mode.includes('w')) {
        const nx = Math.min(o.x + dx, o.x + o.w - 20);
        w = o.w + (o.x - nx);
        x = nx;
      }
      if (drag.mode.includes('e')) w = o.w + dx;

      x = Math.max(0, x);
      y = Math.max(0, y);
      w = Math.max(20, w);
      h = Math.max(20, h);
      w = Math.min(w, natural.w - x);
      h = Math.min(h, natural.h - y);
      next = {
        x: Math.round(x),
        y: Math.round(y),
        w: Math.round(w),
        h: Math.round(h),
      };
    }
    onChange(next);
  };

  const onPointerUp = () => setDrag(null);
  const disp = toDisplay(value);

  return (
    <div
      ref={boxRef}
      className="relative h-[420px] w-full select-none overflow-hidden rounded-md border border-border bg-muted/30"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      <img
        ref={imgRef}
        src={imgUrl}
        alt="crop"
        className="absolute inset-0 h-full w-full object-contain"
        draggable={false}
      />
      {/* dim outside crop box */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'rgba(0,0,0,.45)',
          clipPath: `polygon(0% 0%, 0% 100%, ${disp.left}px 100%, ${disp.left}px ${disp.top}px, ${disp.left + disp.width}px ${disp.top}px, ${disp.left + disp.width}px ${disp.top + disp.height}px, ${disp.left}px ${disp.top + disp.height}px, ${disp.left}px 100%, 100% 100%, 100% 0%)`,
        }}
      />
      <div
        className="absolute cursor-move border-2 border-white shadow-lg"
        style={{ left: disp.left, top: disp.top, width: disp.width, height: disp.height }}
        onPointerDown={onPointerDown('move')}
      >
        {(['nw', 'ne', 'sw', 'se'] as const).map((c) => (
          <span
            key={c}
            onPointerDown={onPointerDown(c)}
            className="absolute h-3 w-3 rounded-sm border border-white bg-accent"
            style={{
              left: c === 'nw' || c === 'sw' ? -6 : undefined,
              right: c === 'ne' || c === 'se' ? -6 : undefined,
              top: c === 'nw' || c === 'ne' ? -6 : undefined,
              bottom: c === 'sw' || c === 'se' ? -6 : undefined,
              cursor: c === 'nw' || c === 'se' ? 'nwse-resize' : 'nesw-resize',
            }}
          />
        ))}
      </div>
      {natural ? (
        <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 font-mono text-[11px] text-white">
          裁剪 {value.x},{value.y} · {value.w}×{value.h}（原图 {natural.w}×{natural.h}）
        </div>
      ) : null}
    </div>
  );
}
