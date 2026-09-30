import { useEffect, useRef, useState, useCallback } from 'react';
import { generateLivePreview, type LivePreviewResult } from '@/engine/live-preview';
import { formatBytes } from '@/engine/jobs';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { Maximize2, RefreshCw, Eye, Split, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface LivePreviewPanelProps {
  files: File[];
  activeSampleIndex: number;
  onSelectSampleIndex: (idx: number) => void;
  toolId: string;
  session: any;
  onInspect?: (title: string, url: string) => void;
  className?: string;
}

export function LivePreviewPanel({
  files,
  activeSampleIndex,
  onSelectSampleIndex,
  toolId,
  session,
  onInspect,
  className,
}: LivePreviewPanelProps) {
  const [data, setData] = useState<LivePreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'result' | 'original' | 'split'>('result');
  const [splitPos, setSplitPos] = useState(50); // percentage for A/B slider
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const prevUrlsRef = useRef<{ preview?: string; original?: string }>({});

  const sampleFile = files[activeSampleIndex] || files[0];

  const updatePreview = useCallback(async () => {
    if (!sampleFile) return;
    setLoading(true);
    try {
      const res = await generateLivePreview(sampleFile, toolId, session);

      // Clean up previous URLs
      if (prevUrlsRef.current.preview && prevUrlsRef.current.preview !== res.previewUrl) {
        URL.revokeObjectURL(prevUrlsRef.current.preview);
      }
      if (prevUrlsRef.current.original && prevUrlsRef.current.original !== res.originalUrl) {
        URL.revokeObjectURL(prevUrlsRef.current.original);
      }
      prevUrlsRef.current = { preview: res.previewUrl, original: res.originalUrl };

      setData(res);
    } catch (err) {
      console.error('Failed to generate live preview:', err);
    } finally {
      setLoading(false);
    }
  }, [sampleFile, toolId, session]);

  // Debounced preview generation on parameter or sample changes
  useEffect(() => {
    const timer = setTimeout(() => {
      void updatePreview();
    }, 60);

    return () => clearTimeout(timer);
  }, [updatePreview]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (prevUrlsRef.current.preview) URL.revokeObjectURL(prevUrlsRef.current.preview);
      if (prevUrlsRef.current.original) URL.revokeObjectURL(prevUrlsRef.current.original);
    };
  }, []);

  // Split slider drag handling
  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    handlePointerMove(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percent = Math.round((x / rect.width) * 100);
    setSplitPos(percent);
  };

  const handlePointerUp = () => {
    isDraggingRef.current = false;
  };

  const hasCompareAbility = ['image-compress', 'image-convert', 'image-color', 'image-watermark', 'image-resize', 'image-rotate'].includes(toolId);

  const isCompressionGoal = ['image-compress', 'image-convert'].includes(toolId);
  const savedPercent =
    isCompressionGoal && data && data.estimatedSize && data.originalSize > 0
      ? Math.round(((data.originalSize - data.estimatedSize) / data.originalSize) * 100)
      : null;

  return (
    <div className={cn('flex flex-col rounded-xl border border-border bg-card/60 p-3 shadow-xs', className)}>
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-border text-xs">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 font-semibold text-foreground">
            <Eye className="h-3.5 w-3.5 text-primary" />
            <span>实时效果校准</span>
          </span>

          {files.length > 1 ? (
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground text-[11px] shrink-0">样本:</span>
              <Select
                size="sm"
                aria-label="选择校准样本"
                value={String(activeSampleIndex)}
                onChange={(val) => onSelectSampleIndex(Number(val))}
                className="w-[140px]"
                options={files.map((f, i) => ({
                  value: String(i),
                  label: `${f.name} (${formatBytes(f.size)})`,
                }))}
              />
            </div>
          ) : sampleFile ? (
            <Badge variant="outline" className="text-[10px] text-muted-foreground max-w-[140px] truncate">
              {sampleFile.name}
            </Badge>
          ) : null}
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-1">
          {hasCompareAbility ? (
            <div className="flex rounded-md border border-border bg-muted/60 p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setMode('result')}
                className={cn(
                  'rounded px-2 py-0.5 font-medium transition-colors cursor-pointer',
                  mode === 'result' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                效果图
              </button>
              <button
                type="button"
                onClick={() => setMode('original')}
                className={cn(
                  'rounded px-2 py-0.5 font-medium transition-colors cursor-pointer',
                  mode === 'original' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                原图
              </button>
              <button
                type="button"
                onClick={() => setMode('split')}
                title="左右分屏滑动对比"
                className={cn(
                  'flex items-center gap-1 rounded px-2 py-0.5 font-medium transition-colors cursor-pointer',
                  mode === 'split' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Split className="h-2.5 w-2.5" />
                对比
              </button>
            </div>
          ) : null}

          {onInspect && data ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              title="放大查看大图"
              onClick={() => onInspect(sampleFile?.name || '预览', data.previewUrl)}
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      </div>

      {/* Main Viewport */}
      <div
        ref={containerRef}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="relative my-2.5 flex h-64 sm:h-72 w-full items-center justify-center overflow-hidden rounded-lg border border-border/80 bg-[radial-gradient(#8882_1px,transparent_1px)] [background-size:14px_14px] bg-muted/20 select-none"
      >
        {loading ? (
          <div className="absolute right-3 top-3 z-20 flex items-center gap-1 rounded bg-background/80 px-2 py-0.5 text-[10px] text-muted-foreground backdrop-blur-xs shadow-xs">
            <RefreshCw className="h-2.5 w-2.5 animate-spin text-primary" />
            <span>实时渲染中…</span>
          </div>
        ) : null}

        {data ? (
          mode === 'split' ? (
            // A/B Split comparison slider view
            <div className="relative h-full w-full">
              {/* Outcome layer (bottom right) */}
              <img
                src={data.previewUrl}
                alt="效果图"
                className="absolute inset-0 h-full w-full object-contain pointer-events-none"
              />

              {/* Original layer (clipped to left) */}
              <div
                className="absolute inset-0 h-full w-full overflow-hidden"
                style={{ clipPath: `inset(0 ${100 - splitPos}% 0 0)` }}
              >
                <img
                  src={data.originalUrl}
                  alt="原图"
                  className="h-full w-full object-contain pointer-events-none"
                />
              </div>

              {/* Slider divider line and drag handle */}
              <div
                onPointerDown={handlePointerDown}
                style={{ left: `${splitPos}%` }}
                className="absolute top-0 bottom-0 z-10 w-1 -ml-0.5 bg-primary cursor-ew-resize flex items-center justify-center shadow-lg"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background shadow-md text-foreground">
                  <Split className="h-3 w-3 rotate-90" />
                </div>
              </div>

              {/* Labels */}
              <div className="pointer-events-none absolute left-3 top-3 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-xs">
                原图
              </div>
              <div className="pointer-events-none absolute right-3 top-3 rounded bg-primary/80 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-xs">
                效果图
              </div>
            </div>
          ) : (
            // Single image view
            <div className="relative flex h-full w-full items-center justify-center p-2">
              <img
                src={mode === 'original' ? data.originalUrl : data.previewUrl}
                alt={mode === 'original' ? '原图' : '效果图'}
                className="max-h-full max-w-full object-contain rounded"
              />
              <div className="absolute left-3 top-3 rounded bg-background/80 px-2 py-0.5 text-[10px] font-medium text-foreground backdrop-blur-xs shadow-xs border border-border">
                {mode === 'original' ? '原图' : '实时效果'}
              </div>
            </div>
          )
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
            <ImageIcon className="h-8 w-8 stroke-1" />
            <span className="text-xs">正在载入预览样本…</span>
          </div>
        )}
      </div>

      {/* Footer Metrics & Dimension Bar */}
      {data ? (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] text-muted-foreground pt-1 px-1">
          <div className="flex items-center gap-2">
            <span>原图: {formatBytes(data.originalSize)}</span>
            {data.estimatedSize ? (
              <>
                <span className="text-border">|</span>
                <span className="font-semibold text-foreground">
                  预估: {formatBytes(data.estimatedSize)}
                </span>
                {savedPercent !== null && (
                  <Badge
                    variant={savedPercent > 0 ? 'secondary' : 'outline'}
                    className={cn(
                      'text-[10px] px-1.5 py-0',
                      savedPercent > 0 && 'text-green-600 dark:text-green-400 font-bold'
                    )}
                  >
                    {savedPercent > 0 ? `节省 ${savedPercent}%` : `变化 ${savedPercent}%`}
                  </Badge>
                )}
              </>
            ) : null}
          </div>

          <div className="flex items-center gap-2 text-[10px]">
            {data.naturalWidth && data.width && data.width !== data.naturalWidth ? (
              <span>
                尺寸: {data.naturalWidth}×{data.naturalHeight} → {data.width}×{data.height}
              </span>
            ) : data.width ? (
              <span>尺寸: {data.width}×{data.height}</span>
            ) : null}
            {data.info ? <span className="text-foreground/80">({data.info})</span> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
