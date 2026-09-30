import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { computeTextDiff, type DiffLine } from '@/engine/dev-tools';
import { formatJson } from '@/lib/utils';
import { Plus, Minus, ArrowLeftRight } from 'lucide-react';

export function TextDiffTool({ notify }: { notify: (title: string, desc?: string, type?: 'success' | 'danger') => void }) {
  const [mode, setMode] = useState<'lines' | 'words'>('lines');
  const [left, setLeft] = useState<string>(
    '{\n  "service": "toolbox",\n  "status": "online",\n  "version": "1.0",\n  "timeout": 30\n}'
  );
  const [right, setRight] = useState<string>(
    '{\n  "service": "toolbox",\n  "status": "active",\n  "version": "2.0",\n  "timeout": 30,\n  "retries": 3\n}'
  );
  const [diffResult, setDiffResult] = useState<{
    lines: DiffLine[];
    stats: { added: number; removed: number; unchanged: number };
  } | null>(null);

  const handleDiff = () => {
    const res = computeTextDiff(left, right, mode);
    setDiffResult(res);
  };

  const handleFormatJson = () => {
    let formattedLeft = left;
    let formattedRight = right;
    const r1 = formatJson(left, 2);
    if (r1.ok) formattedLeft = r1.value;
    const r2 = formatJson(right, 2);
    if (r2.ok) formattedRight = r2.value;

    setLeft(formattedLeft);
    setRight(formattedRight);
    const res = computeTextDiff(formattedLeft, formattedRight, mode);
    setDiffResult(res);
    notify('已自动格式化两侧 JSON 并重新比对', undefined, 'success');
  };

  const handleSwap = () => {
    const temp = left;
    setLeft(right);
    setRight(temp);
    if (diffResult) {
      setDiffResult(computeTextDiff(right, temp, mode));
    }
  };

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 pt-4">
        <div className="flex items-center gap-3">
          <CardTitle className="text-sm font-semibold">文本 / JSON 差异对比</CardTitle>
          <div className="flex items-center rounded-md border border-border bg-muted p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setMode('lines')}
              className={`rounded px-2.5 py-1 font-medium transition-colors ${
                mode === 'lines' ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              按行对比
            </button>
            <button
              type="button"
              onClick={() => setMode('words')}
              className={`rounded px-2.5 py-1 font-medium transition-colors ${
                mode === 'words' ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              按词对比
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {diffResult ? (
            <div className="flex items-center gap-2 mr-2">
              <Badge variant="outline" className="border-green-600/30 bg-green-500/10 text-green-700 dark:text-green-300 text-[11px] gap-1">
                <Plus className="h-3 w-3" />
                {diffResult.stats.added} 行新增
              </Badge>
              <Badge variant="outline" className="border-red-600/30 bg-red-500/10 text-red-700 dark:text-red-300 text-[11px] gap-1">
                <Minus className="h-3 w-3" />
                {diffResult.stats.removed} 行删除
              </Badge>
            </div>
          ) : null}

          <Button variant="outline" size="sm" onClick={handleFormatJson} title="如果为 JSON 则自动格式化缩进">
            格式化 JSON
          </Button>
          <Button variant="outline" size="sm" onClick={handleSwap} title="互换左右文本">
            <ArrowLeftRight className="mr-1 h-3.5 w-3.5" />
            互换
          </Button>
          <Button size="sm" onClick={handleDiff}>
            对比差异
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-5">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
              <span>原始文本 (Left)</span>
              <span className="font-mono text-[11px]">{left.split('\n').length} 行</span>
            </div>
            <textarea
              value={left}
              onChange={(e) => setLeft(e.target.value)}
              placeholder="在此粘贴原始文本或 JSON…"
              className="h-64 w-full rounded-md border border-border bg-card p-3 font-mono text-xs leading-relaxed outline-none focus:ring-2 focus:ring-primary/30"
              spellCheck={false}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
              <span>变更文本 (Right)</span>
              <span className="font-mono text-[11px]">{right.split('\n').length} 行</span>
            </div>
            <textarea
              value={right}
              onChange={(e) => setRight(e.target.value)}
              placeholder="在此粘贴变更后的文本或 JSON…"
              className="h-64 w-full rounded-md border border-border bg-card p-3 font-mono text-xs leading-relaxed outline-none focus:ring-2 focus:ring-primary/30"
              spellCheck={false}
            />
          </div>
        </div>

        {/* Diff Result View */}
        {diffResult ? (
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">比对详情</span>
              <span className="text-[11px] text-muted-foreground font-mono">
                共 {diffResult.lines.length} 行 · 保持 {diffResult.stats.unchanged} 行
              </span>
            </div>
            <div className="max-h-96 overflow-auto rounded-lg border border-border bg-card font-mono text-xs shadow-xs">
              <div className="divide-y divide-border/40">
                {diffResult.lines.map((l, idx) => (
                  <div
                    key={idx}
                    className={`flex items-start px-2 py-1 leading-relaxed ${
                      l.type === 'added'
                        ? 'bg-green-500/10 text-green-700 dark:text-green-300 font-medium'
                        : l.type === 'removed'
                          ? 'bg-red-500/10 text-red-700 dark:text-red-300 line-through opacity-85'
                          : 'text-foreground/80 hover:bg-muted/30'
                    }`}
                  >
                    <span className="w-8 shrink-0 select-none text-right font-mono text-[10px] text-muted-foreground/60 pr-2">
                      {l.leftLine ?? ''}
                    </span>
                    <span className="w-8 shrink-0 select-none text-right font-mono text-[10px] text-muted-foreground/60 pr-3">
                      {l.rightLine ?? ''}
                    </span>
                    <span className="w-5 shrink-0 select-none font-bold text-center">
                      {l.type === 'added' ? '+' : l.type === 'removed' ? '-' : ' '}
                    </span>
                    <span className="flex-1 whitespace-pre-wrap break-all">{l.value || ' '}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
