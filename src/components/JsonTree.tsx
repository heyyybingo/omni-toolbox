import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Braces, Brackets, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

type JsonValue = unknown;

type TreeProps = {
  value: JsonValue;
  name?: string;
  path?: string;
  depth?: number;
  defaultExpandedDepth?: number;
  /** force open/closed when these change from parent */
  expandAllSignal?: number;
  collapseAllSignal?: number;
  onCopyPath?: (path: string) => void;
};

function isObject(v: JsonValue): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isArray(v: JsonValue): v is unknown[] {
  return Array.isArray(v);
}

function Primitive({ value }: { value: JsonValue }) {
  if (value === null) return <span className="text-muted-foreground italic">null</span>;
  if (typeof value === 'string') {
    return <span className="text-emerald-700 dark:text-emerald-300">&quot;{value}&quot;</span>;
  }
  if (typeof value === 'number') return <span className="text-sky-700 dark:text-sky-300">{String(value)}</span>;
  if (typeof value === 'boolean') return <span className="text-violet-700 dark:text-violet-300">{String(value)}</span>;
  return <span className="text-muted-foreground">{String(value)}</span>;
}

function Meta({ value }: { value: JsonValue }) {
  if (isArray(value)) {
    return (
      <span className="ml-1 font-mono text-[11px] text-muted-foreground">
        [{value.length}]
      </span>
    );
  }
  if (isObject(value)) {
    const n = Object.keys(value).length;
    return (
      <span className="ml-1 font-mono text-[11px] text-muted-foreground">
        {'{'}{n}{'}'}
      </span>
    );
  }
  return null;
}

export function JsonTree({
  value,
  name,
  path = '$',
  depth = 0,
  defaultExpandedDepth = 2,
  expandAllSignal = 0,
  collapseAllSignal = 0,
  onCopyPath,
}: TreeProps) {
  const container = isObject(value) || isArray(value);
  const [open, setOpen] = useState(depth < defaultExpandedDepth);

  useEffect(() => {
    if (expandAllSignal > 0) setOpen(true);
  }, [expandAllSignal]);

  useEffect(() => {
    if (collapseAllSignal > 0) setOpen(false);
  }, [collapseAllSignal]);

  const entries = useMemo(() => {
    if (isArray(value)) return value.map((item, i) => ({ key: String(i), item }));
    if (isObject(value)) return Object.entries(value).map(([key, item]) => ({ key, item }));
    return [];
  }, [value]);

  const childPath = (key: string) => (isArray(value) ? `${path}[${key}]` : `${path}.${key}`);

  if (!container) {
    return (
      <div className="flex items-center gap-1 py-0.5 font-mono text-xs leading-5" style={{ paddingLeft: depth * 14 }}>
        {name != null ? (
          <>
            <span className="text-muted-foreground">{name}:</span>
            <Primitive value={value} />
          </>
        ) : (
          <Primitive value={value} />
        )}
        {onCopyPath ? (
          <button
            type="button"
            className="ml-1 rounded p-0.5 opacity-0 hover:bg-muted group-hover:opacity-100"
            title="复制路径"
            onClick={() => onCopyPath(path)}
          >
            <Copy className="h-3 w-3" />
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="group">
      <button
        type="button"
        className="flex w-full items-center gap-0.5 rounded py-0.5 text-left font-mono text-xs leading-5 hover:bg-muted/60"
        style={{ paddingLeft: depth * 14 }}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />}
        {isArray(value) ? (
          <Brackets className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <Braces className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        {name != null ? <span className="text-muted-foreground">{name}</span> : <span className="text-muted-foreground">root</span>}
        <Meta value={value} />
        {onCopyPath ? (
          <span
            role="button"
            tabIndex={0}
            className="ml-1 rounded p-0.5 opacity-0 hover:bg-muted focus:opacity-100 group-hover:opacity-100"
            title="复制路径"
            onClick={(e) => {
              e.stopPropagation();
              onCopyPath(path);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.stopPropagation();
                onCopyPath(path);
              }
            }}
          >
            <Copy className="h-3 w-3" />
          </span>
        ) : null}
      </button>
      {open ? (
        <div>
          {entries.map(({ key, item }) => (
            <JsonTree
              key={`${key}-${expandAllSignal}-${collapseAllSignal}`}
              value={item}
              name={key}
              path={childPath(key)}
              depth={depth + 1}
              defaultExpandedDepth={defaultExpandedDepth}
              expandAllSignal={expandAllSignal}
              collapseAllSignal={collapseAllSignal}
              onCopyPath={onCopyPath}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function JsonTreePanel({
  data,
  className,
  onCopyPath,
  expandAllSignal = 0,
  collapseAllSignal = 0,
}: {
  data: JsonValue;
  className?: string;
  onCopyPath?: (path: string) => void;
  expandAllSignal?: number;
  collapseAllSignal?: number;
}) {
  return (
    <div className={cn('max-h-[420px] overflow-auto rounded-md border border-border bg-card p-3', className)}>
      <JsonTree
        value={data}
        onCopyPath={onCopyPath}
        defaultExpandedDepth={2}
        expandAllSignal={expandAllSignal}
        collapseAllSignal={collapseAllSignal}
      />
    </div>
  );
}
