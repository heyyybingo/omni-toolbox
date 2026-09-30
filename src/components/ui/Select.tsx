import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SelectOption = { value: string; label: string };

export type SelectSize = 'default' | 'sm';

type Props = {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  id?: string;
  size?: SelectSize;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  'aria-label'?: string;
  /** footer slot (e.g. preset quick-add) */
  footer?: ReactNode;
};

/** System-styled select dropdown following Linear/Notion workbench style. */
export function Select({
  value,
  options,
  onChange,
  id,
  size = 'default',
  disabled,
  className,
  placeholder = '请选择',
  'aria-label': ariaLabel,
  footer,
}: Props) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    if (open) {
      const idx = options.findIndex((o) => o.value === value);
      setActiveIndex(idx >= 0 ? idx : 0);
    }
  }, [open, value, options]);

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < options.length) {
        onChange(options[activeIndex].value);
        setOpen(false);
      }
    }
  };

  return (
    <div ref={wrapRef} className={cn('relative inline-block w-full', className)}>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel || id}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={handleKeyDown}
        className={cn(
          'flex w-full items-center justify-between gap-1.5 rounded-md border border-border bg-card transition-colors',
          size === 'sm' ? 'h-7 px-2 text-xs' : 'h-8 px-2.5 text-xs',
          open && 'ring-2 ring-primary/30 border-primary/50',
          'hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'
        )}
      >
        <span className={cn('truncate', !selected && 'text-muted-foreground')}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={cn(
            'shrink-0 text-muted-foreground transition-transform duration-150',
            size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5',
            open && 'rotate-180 text-foreground'
          )}
        />
      </button>

      {open ? (
        <div
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1 w-full min-w-[160px] overflow-hidden rounded-lg border border-border bg-card shadow-lg animate-in fade-in-50 zoom-in-95 duration-100"
        >
          <div className="max-h-64 overflow-auto p-1">
            {options.map((o, idx) => {
              const isSelected = o.value === value;
              const isActive = idx === activeIndex;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={cn(
                    'w-full rounded-md text-left font-medium transition-colors',
                    size === 'sm' ? 'px-2 py-1 text-xs' : 'px-2.5 py-1.5 text-xs',
                    isSelected
                      ? 'bg-accent text-accent-foreground font-semibold'
                      : isActive
                        ? 'bg-muted text-foreground'
                        : 'text-foreground/90 hover:bg-muted'
                  )}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                    buttonRef.current?.focus();
                  }}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
          {footer ? <div className="border-t border-border p-2">{footer}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
