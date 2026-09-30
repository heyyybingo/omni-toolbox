import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Mount/unmount animation: open immediately; on close, play out then unmount.
 * kind: drawer (slide) | modal (scale+fade)
 */
export function MotionPanel({
  open,
  onClose: _onClose,
  kind = 'drawer',
  className,
  children,
  onClick,
}: {
  open: boolean;
  onClose: () => void;
  kind?: 'drawer' | 'modal';
  className?: string;
  children: ReactNode;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}) {
  const [visible, setVisible] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<number | null>(null);
  const cachedChildrenRef = useRef<ReactNode>(children);

  if (open) {
    cachedChildrenRef.current = children;
  }

  useEffect(() => {
    if (open) {
      setVisible(true);
      setLeaving(false);
      return;
    }
    if (!visible) return;
    setLeaving(true);
    timer.current = window.setTimeout(() => {
      setVisible(false);
      setLeaving(false);
    }, 180);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [open, visible]);

  if (!visible) return null;

  return (
    <div
      className={cn(
        kind === 'drawer'
          ? leaving
            ? 'motion-drawer-out'
            : 'motion-drawer-in'
          : leaving
            ? 'motion-modal-out'
            : 'motion-modal-in',
        className
      )}
      onClick={onClick}
      onAnimationEnd={() => {
        if (leaving) setVisible(false);
      }}
    >
      {open ? children : (cachedChildrenRef.current ?? children)}
    </div>
  );
}

export function MotionOverlay({
  open,
  onClose,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const [visible, setVisible] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<number | null>(null);
  const cachedChildrenRef = useRef<ReactNode>(children);

  if (open) {
    cachedChildrenRef.current = children;
  }

  useEffect(() => {
    if (open) {
      setVisible(true);
      setLeaving(false);
      return;
    }
    if (!visible) return;
    setLeaving(true);
    timer.current = window.setTimeout(() => {
      setVisible(false);
      setLeaving(false);
    }, 180);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [open, visible]);

  if (!visible) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-xs p-4 pt-[12vh]',
        leaving ? 'motion-fade-out' : 'motion-fade-in',
        className
      )}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      onAnimationEnd={() => {
        if (leaving) setVisible(false);
      }}
    >
      <div
        className={cn(
          'w-full flex justify-center',
          leaving ? 'motion-modal-out' : 'motion-modal-in'
        )}
      >
        {open ? children : (cachedChildrenRef.current ?? children)}
      </div>
    </div>
  );
}
