import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/Select';
import { jsonToCsv, csvToJson, parseJsonSafe, downloadBlob } from '@/lib/utils';
import { ArrowLeftRight, Copy, Download, Check, AlertCircle } from 'lucide-react';

const DEFAULT_JSON = `[
  { "id": 1, "name": "Toolbox", "category": "Developer", "status": "active" },
  { "id": 2, "name": "Image Studio", "category": "Design", "status": "active" },
  { "id": 3, "name": "PDF Engine", "category": "Document", "status": "ready" }
]`;

export function JsonCsvTool({ notify }: { notify: (title: string, desc?: string, type?: 'success' | 'danger' | 'info') => void }) {
  const [direction, setDirection] = useState<'json-to-csv' | 'csv-to-json'>('json-to-csv');
  const [delimiter, setDelimiter] = useState<string>(',');
  const [input, setInput] = useState<string>(DEFAULT_JSON);
  const [output, setOutput] = useState<string>(() => {
    try {
      const parsed = JSON.parse(DEFAULT_JSON);
      return jsonToCsv(parsed, ',');
    } catch {
      return '';
    }
  });
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const doConvert = (
    text: string,
    dir: 'json-to-csv' | 'csv-to-json',
    delim: string,
    silent = false
  ) => {
    setError(null);
    if (!text.trim()) {
      setOutput('');
      return;
    }
    if (dir === 'json-to-csv') {
      const parsed = parseJsonSafe(text);
      if (!parsed.ok) {
        setError(parsed.error);
        notify('JSON 解析失败', parsed.error, 'danger');
        return;
      }
      try {
        const csv = jsonToCsv(parsed.value, delim);
        setOutput(csv);
        if (!silent) {
          notify('转换成功', undefined, 'success');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        notify('转为 CSV 失败', msg, 'danger');
      }
    } else {
      try {
        const rows = csvToJson(text, delim);
        if (!rows.length && text.trim()) {
          throw new Error('未识别到有效的 CSV 表格数据行');
        }
        setOutput(JSON.stringify(rows, null, 2));
        if (!silent) {
          notify('转换成功', undefined, 'success');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        notify('转为 JSON 失败', msg, 'danger');
      }
    }
  };

  const handleConvert = () => {
    doConvert(input, direction, delimiter, false);
  };

  const handleSwap = () => {
    const nextDir = direction === 'json-to-csv' ? 'csv-to-json' : 'json-to-csv';
    setDirection(nextDir);
    setError(null);

    const curInput = input.trim();
    const curOutput = output.trim();

    if (curOutput) {
      // Direct swap of sides: what was output becomes input, what was input becomes output
      setInput(output);
      setOutput(input);
      notify('已互换方向与内容', undefined, 'info');
    } else if (curInput) {
      // Output was empty: convert current input into target format so input matches new role
      if (direction === 'json-to-csv') {
        const parsed = parseJsonSafe(input);
        if (!parsed.ok) {
          setError(`互换失败：当前输入不是有效 JSON（${parsed.error}）`);
          notify('互换失败', parsed.error, 'danger');
        } else {
          try {
            const csv = jsonToCsv(parsed.value, delimiter);
            setInput(csv);
            setOutput(input);
            notify('已互换方向与内容', undefined, 'info');
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setError(`互换失败：${msg}`);
            notify('互换失败', msg, 'danger');
          }
        }
      } else {
        try {
          const rows = csvToJson(input, delimiter);
          const jsonStr = JSON.stringify(rows, null, 2);
          setInput(jsonStr);
          setOutput(input);
          notify('已互换方向与内容', undefined, 'info');
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setError(`互换失败：${msg}`);
          notify('互换失败', msg, 'danger');
        }
      }
    } else {
      notify('已切换转换方向', undefined, 'info');
    }
  };

  const handleDelimiterChange = (newDelim: string) => {
    setDelimiter(newDelim);
    if (input.trim()) {
      doConvert(input, direction, newDelim, true);
    }
  };

  const handleCopy = () => {
    if (!output) return;
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    notify('已复制到剪贴板', undefined, 'success');
  };

  const handleDownload = () => {
    if (!output) return;
    const ext = direction === 'json-to-csv' ? 'csv' : 'json';
    const mime = direction === 'json-to-csv' ? 'text/csv' : 'application/json';
    downloadBlob(new Blob([output], { type: mime }), `converted.${ext}`);
  };

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 pt-4">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm font-semibold">JSON ↔ CSV 互转</CardTitle>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">分隔符:</span>
          <Select
            size="sm"
            className="w-28"
            value={delimiter}
            onChange={handleDelimiterChange}
            options={[
              { value: ',', label: '逗号 (,)' },
              { value: ';', label: '分号 (;)' },
              { value: '\t', label: '制表符 (Tab)' },
            ]}
          />
          <Button variant="outline" size="sm" onClick={handleSwap} title="互换两侧内容与转换方向">
            <ArrowLeftRight className="mr-1 h-3.5 w-3.5" />
            互换
          </Button>
          <Button size="sm" onClick={handleConvert}>
            转换
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
              <span>输入 ({direction === 'json-to-csv' ? 'JSON' : 'CSV'})</span>
              <span className="font-mono text-[11px]">{input.length} 字符</span>
            </div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={direction === 'json-to-csv' ? '在此粘贴或输入 JSON 数组或对象…' : '在此粘贴或输入 CSV 文本…'}
              className="h-96 w-full rounded-md border border-border bg-card p-3 font-mono text-xs leading-relaxed outline-none focus:ring-2 focus:ring-primary/30"
              spellCheck={false}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
              <span>输出 ({direction === 'json-to-csv' ? 'CSV' : 'JSON'})</span>
              <div className="flex items-center gap-1.5">
                {output ? (
                  <>
                    <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs" onClick={handleCopy}>
                      {copied ? <Check className="mr-1 h-3 w-3 text-green-600" /> : <Copy className="mr-1 h-3 w-3" />}
                      {copied ? '已复制' : '复制'}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs" onClick={handleDownload}>
                      <Download className="mr-1 h-3 w-3" />
                      下载
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
            <textarea
              value={output}
              readOnly
              placeholder="转换结果将在此处展示…"
              className="h-96 w-full rounded-md border border-border bg-muted/20 p-3 font-mono text-xs leading-relaxed text-foreground outline-none"
              spellCheck={false}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
