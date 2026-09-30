import { useEffect, useState } from 'react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import { CropEditor, type CropRect } from '@/components/CropEditor';

GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

async function renderPdfPageBlob(
  file: File,
  pageIndex: number,
  scale: number
): Promise<{ blob: Blob; width: number; height: number }> {
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await getDocument({ data }).promise;
  const page = await doc.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  await page.render({ canvasContext: ctx, viewport }).promise;
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png');
  });
  return { blob, width: viewport.width, height: viewport.height };
}

export function usePdfPageThumbs(file: File | null, max = 12) {
  const [pages, setPages] = useState<{ src: string; n: number }[]>([]);
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setPages([]);
    if (!file) return;
    (async () => {
      const data = new Uint8Array(await file.arrayBuffer());
      const doc = await getDocument({ data }).promise;
      const total = doc.numPages;
      const limit = Math.min(total, max);
      const list: { src: string; n: number }[] = [];
      for (let i = 1; i <= limit; i++) {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: 0.35 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        await page.render({ canvasContext: ctx, viewport }).promise;
        list.push({ src: canvas.toDataURL('image/jpeg', 0.7), n: i });
        if (cancelled) return;
        setPages([...list]);
      }
      setCount(total);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [file]);

  return { pages, count };
}

/** Page strip for reorder: shows current order expression applied. */
export function PageOrderPreview({
  file,
  order,
}: {
  file: File;
  order: string;
}) {
  const { pages, count } = usePdfPageThumbs(file, 16);
  let seq: number[] = [];
  try {
    const parts = (order || '').trim();
    if (!parts) seq = pages.map((p) => p.n);
    else {
      const set = new Set<number>();
      for (const part of parts.split(',')) {
        const piece = part.trim();
        if (!piece) continue;
        if (piece.includes('-')) {
          const [a, b] = piece.split('-').map((x) => parseInt(x, 10));
          for (let i = Math.min(a, b); i <= Math.max(a, b); i++) if (i >= 1 && i <= count) set.add(i);
        } else {
          const p = parseInt(piece, 10);
          if (p >= 1 && p <= count) set.add(p);
        }
      }
      seq = [...set];
      for (let i = 1; i <= count; i++) if (!seq.includes(i) && seq.length < count) seq.push(i);
    }
  } catch {
    seq = pages.map((p) => p.n);
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">
        结果页序预览（共 {count} 页）{count > 16 ? '，仅显示前 16 张缩略图' : ''}
      </div>
      <div className="flex flex-wrap gap-2">
        {seq.slice(0, 32).map((n, i) => {
          const thumb = pages.find((p) => p.n === n);
          return (
            <div key={`${n}-${i}`} className="w-14">
              <div className="relative overflow-hidden rounded border border-border bg-muted">
                {thumb ? (
                  <img src={thumb.src} alt={`p${n}`} className="block w-full" />
                ) : (
                  <div className="flex h-16 items-center justify-center text-[10px] text-muted-foreground">
                    p{n}
                  </div>
                )}
                <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[10px] text-white">
                  {i + 1}
                </span>
              </div>
              <div className="mt-0.5 text-center text-[10px] text-muted-foreground">原 {n}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Real n-up preview: first sheet with actual page thumbs in export layout. */
export function NupPreview({ file, n }: { file: File; n: 2 | 4 }) {
  const { pages, count } = usePdfPageThumbs(file, n);
  const cols = 2;
  const rows = n === 2 ? 1 : 2;

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">
        首张拼版预览 · 全文约 {Math.ceil(Math.max(count, 1) / n)} 张纸
      </div>
      <div
        className="rounded-md border border-border bg-white p-2 shadow-sm"
        style={{ maxWidth: 320 }}
      >
        <div
          className="grid gap-1.5"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, 110px)`,
          }}
        >
          {Array.from({ length: n }).map((_, i) => {
            const thumb = pages[i];
            return (
              <div
                key={i}
                className="overflow-hidden rounded border border-border bg-muted"
                title={thumb ? `原第 ${thumb.n} 页` : `第 ${i + 1} 格`}
              >
                {thumb ? (
                  <img src={thumb.src} alt={`slot ${i + 1}`} className="h-full w-full object-cover object-top" />
                ) : (
                  <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">
                    空位
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="text-[11px] text-muted-foreground">
        排版：{n === 2 ? '左右各 1 页' : '2×2 四页'} · 可滚动预览下方为全部页缩略
      </div>
    </div>
  );
}

/**
 * Live PDF crop: renders page 1 at scale=1 (≈ PDF points),
 * crop rect maps to page margins for export.
 */
export function PdfCropEditor({
  file,
  value,
  onChange,
}: {
  file: File;
  value: CropRect;
  onChange: (rect: CropRect) => void;
}) {
  const [pageFile, setPageFile] = useState<File | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPageFile(null);
    (async () => {
      const { blob, width, height } = await renderPdfPageBlob(file, 0, 1);
      if (cancelled) return;
      setPageFile(new File([blob], 'page1.png', { type: 'image/png' }));
      if (!value.w || !value.h) {
        onChange({ x: 24, y: 24, w: Math.round(width - 48), h: Math.round(height - 48) });
      }
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  if (!pageFile) {
    return <div className="text-sm text-muted-foreground">渲染 PDF 页面…</div>;
  }
  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">在页面上框选裁剪区（第 1 页，单位≈pt）</div>
      <CropEditor file={pageFile} value={value} onChange={onChange} />
    </div>
  );
}
