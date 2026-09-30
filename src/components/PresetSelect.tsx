import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type PresetItem = {
  id: string;
  toolId: string;
  name: string;
  data: Record<string, unknown>;
};

type Props = {
  presets: PresetItem[];
  value: string | null;
  onChange: (id: string | null) => void;
  onQuickAdd: (name: string) => void;
  onUpdatePreset: (id: string) => void;
  disabled?: boolean;
};

/** System-styled select for presets conforming to workbench design guidelines. */
export function PresetSelect({
  presets,
  value,
  onChange,
  onQuickAdd,
  onUpdatePreset,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = presets.find((p) => p.id === value) || null;

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div ref={wrapRef} className="relative inline-block">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={disabled}
          role="combobox"
          aria-expanded={open}
          aria-label="选择预设"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'flex h-8 min-w-[160px] items-center justify-between gap-2 rounded-md border border-border bg-card px-2.5 text-xs transition-colors',
            open && 'ring-2 ring-primary/30 border-primary/50',
            'hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'
          )}
        >
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>
            {selected ? selected.name : '预设：不使用'}
          </span>
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150',
              open && 'rotate-180 text-foreground'
            )}
          />
        </button>
        {selected ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs font-normal"
            title="把当前参数写回该预设"
            onClick={() => onUpdatePreset(selected.id)}
          >
            保存到预设
          </Button>
        ) : null}
      </div>

      {open ? (
        <div className="absolute left-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-lg border border-border bg-card shadow-lg animate-in fade-in-50 zoom-in-95 duration-100">
          <div className="max-h-56 overflow-auto p-1">
            <button
              type="button"
              className="w-full rounded-md px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted font-medium transition-colors"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              不使用预设
            </button>
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                className={cn(
                  'w-full rounded-md px-2.5 py-1.5 text-left text-xs transition-colors',
                  p.id === value
                    ? 'bg-accent text-accent-foreground font-semibold'
                    : 'text-foreground hover:bg-muted font-medium'
                )}
                onClick={() => {
                  onChange(p.id);
                  setOpen(false);
                }}
              >
                {p.name}
              </button>
            ))}
            {presets.length === 0 ? (
              <div className="px-2.5 py-2 text-xs text-muted-foreground">暂无预设</div>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5 border-t border-border p-2">
            <Input
              className="h-7 min-w-0 flex-1 px-2 text-xs"
              placeholder="新预设名称"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && addName.trim()) {
                  onQuickAdd(addName.trim());
                  setAddName('');
                  setOpen(false);
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              className="h-7 px-2.5 text-xs"
              disabled={!addName.trim()}
              onClick={() => {
                onQuickAdd(addName.trim());
                setAddName('');
                setOpen(false);
              }}
            >
              添加
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
