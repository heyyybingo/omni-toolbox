import { useEffect, type ReactNode } from 'react';
import { X, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Content-area fullscreen: absolute inside the main content column
 * (never covers sidebar or top tabs).
 */
export function FullscreenLayer({
  title,
  onExit,
  actions,
  children,
  className,
}: {
  title: string;
  onExit: () => void;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onExit();
      }
    };
    window.addEventListener('keydown', onKey, true);
    // prevent page body from scrolling underneath the expanded panel
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
    };
  }, [onExit]);

  return (
    <div
      role="dialog"
      aria-label={title}
      className={cn(
        'absolute inset-0 z-30 flex flex-col bg-background',
        className
      )}
    >
      <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border px-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onExit} title="还原" aria-label="还原">
            <Minimize2 className="h-4 w-4" />
          </Button>
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          {actions}
          <Button variant="ghost" size="icon" onClick={onExit} aria-label="关闭">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>
      <div className="relative min-h-0 flex-1 overflow-auto overscroll-contain">{children}</div>
    </div>
  );
}
