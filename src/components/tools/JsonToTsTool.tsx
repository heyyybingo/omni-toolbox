import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/input';
import { jsonToTypeScript } from '@/engine/dev-tools';
import { Copy, Download, Check, AlertCircle, Sparkles } from 'lucide-react';
import { downloadBlob } from '@/lib/utils';

export function JsonToTsTool({ notify }: { notify: (title: string, desc?: string, type?: 'success' | 'danger') => void }) {
  const [rootName, setRootName] = useState('RootObject');
  const [exportPrefix, setExportPrefix] = useState(true);
  const [useTypeAlias, setUseTypeAlias] = useState(false);
  const [readonlyFields, setReadonlyFields] = useState(false);
  const [input, setInput] = useState<string>(
    '{\n  "id": 1001,\n  "title": "Toolbox Update",\n  "author": {\n    "name": "Alex",\n    "email": "alex@example.com",\n    "active": true\n  },\n  "tags": ["frontend", "offline", "utility"],\n  "stats": {\n    "views": 4820,\n    "rating": 4.9\n  }\n}'
  );
  const [output, setOutput] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = () => {
    setError(null);
    if (!input.trim()) {
      setOutput('');
      return;
    }
    const res = jsonToTypeScript(input, {
      rootName,
      exportPrefix,
      useTypeAlias,
      readonlyFields,
    });

    if (res.error) {
      setError(res.error);
      notify('JSON 解析失败', res.error, 'danger');
    } else {
      setOutput(res.code);
      notify('TypeScript 类型生成成功', undefined, 'success');
    }
  };

  const handleCopy = () => {
    if (!output) return;
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    notify('已复制 TypeScript 代码', undefined, 'success');
  };

  const handleDownload = () => {
    if (!output) return;
    const filename = `${rootName.toLowerCase() || 'types'}.ts`;
    downloadBlob(new Blob([output], { type: 'text/typescript' }), filename);
  };

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 pt-4">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm font-semibold">JSON 转 TypeScript 类型声明</CardTitle>
          <div className="flex items-center gap-1.5 pl-2 text-xs">
            <span className="text-muted-foreground">根类型:</span>
            <Input
              value={rootName}
              onChange={(e) => setRootName(e.target.value)}
              className="h-7 w-28 text-xs"
              placeholder="RootObject"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
            <Switch checked={exportPrefix} onChange={setExportPrefix} />
            <span>export</span>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
            <Switch checked={useTypeAlias} onChange={setUseTypeAlias} />
            <span>type 别名</span>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
            <Switch checked={readonlyFields} onChange={setReadonlyFields} />
            <span>readonly</span>
          </label>
          <Button size="sm" onClick={handleGenerate} className="gap-1">
            <Sparkles className="h-3.5 w-3.5" />
            生成 TS 类型
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-5">
        {error ? (
          <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="font-mono">{error}</span>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
              <span>输入 JSON</span>
              <span className="font-mono text-[11px]">{input.length} 字符</span>
            </div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="在此粘贴或输入 JSON 数据…"
              className="h-96 w-full rounded-md border border-border bg-card p-3 font-mono text-xs leading-relaxed outline-none focus:ring-2 focus:ring-primary/30"
              spellCheck={false}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
              <span>生成的 TypeScript 声明</span>
              <div className="flex items-center gap-1.5">
                {output ? (
                  <>
                    <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs" onClick={handleCopy}>
                      {copied ? <Check className="mr-1 h-3 w-3 text-green-600" /> : <Copy className="mr-1 h-3 w-3" />}
                      {copied ? '已复制' : '复制'}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs" onClick={handleDownload}>
                      <Download className="mr-1 h-3 w-3" />
                      下载 .ts
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
            <textarea
              value={output}
              readOnly
              placeholder="点击上方「生成 TS 类型」后展示…"
              className="h-96 w-full rounded-md border border-border bg-muted/20 p-3 font-mono text-xs leading-relaxed text-foreground outline-none"
              spellCheck={false}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
