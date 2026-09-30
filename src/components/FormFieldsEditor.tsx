import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type Row = { k: string; v: string };

function parseRows(value: string): Row[] {
  try {
    const obj = JSON.parse(value || '{}') as Record<string, string>;
    const rows = Object.entries(obj).map(([k, v]) => ({ k, v: String(v) }));
    return rows.length ? rows : [{ k: '', v: '' }];
  } catch {
    return [{ k: '', v: '' }];
  }
}

/** Visual key/value form field editor (stores JSON). */
export function FormFieldsEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (json: string) => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => parseRows(value));

  // re-sync if parent value changes externally
  useEffect(() => {
    setRows((prev) => {
      const next = parseRows(value);
      // only replace when keys differ to avoid clobbering in-progress empty row
      const a = prev.map((r) => r.k).join('|');
      const b = next.map((r) => r.k).join('|');
      return a === b ? prev : next;
    });
  }, [value]);

  const commit = (next: Row[]) => {
    setRows(next);
    const obj: Record<string, string> = {};
    for (const r of next) {
      if (r.k.trim()) obj[r.k.trim()] = r.v;
    }
    onChange(JSON.stringify(obj, null, 2));
  };

  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="flex gap-2">
          <Input
            placeholder="字段名（如 Name）"
            value={row.k}
            onChange={(e) => {
              const next = rows.map((r, j) => (j === i ? { ...r, k: e.target.value } : r));
              commit(next);
            }}
          />
          <Input
            placeholder="要填入的值"
            value={row.v}
            onChange={(e) => {
              const next = rows.map((r, j) => (j === i ? { ...r, v: e.target.value } : r));
              commit(next);
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            aria-label="删除字段"
            onClick={() => commit(rows.filter((_, j) => j !== i))}
          >
            ×
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => commit([...rows, { k: '', v: '' }])}
      >
        + 添加字段
      </Button>
    </div>
  );
}
