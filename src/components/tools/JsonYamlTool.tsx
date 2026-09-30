import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/Select';
import { jsonToYaml, yamlToJson } from '@/engine/dev-tools';
import { ArrowLeftRight, Copy, Download, Check, AlertCircle } from 'lucide-react';
import { downloadBlob } from '@/lib/utils';

const DEFAULT_JSON = `{\n  "name": "toolbox",\n  "version": "1.0.0",\n  "features": [\n    "convert",\n    "compress",\n    "security"\n  ]\n}`;

export function JsonYamlTool({ notify }: { notify: (title: string, desc?: string, type?: 'success' | 'danger' | 'info') => void }) {
  const [direction, setDirection] = useState<'json-to-yaml' | 'yaml-to-json'>('json-to-yaml');
  const [indent, setIndent] = useState<string>('2');
  const [input, setInput] = useState<string>(DEFAULT_JSON);
  const [output, setOutput] = useState<string>(() => {
    const res = jsonToYaml(DEFAULT_JSON, 2);
    return res.yaml || '';
  });
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const doConvert = (
    text: string,
    dir: 'json-to-yaml' | 'yaml-to-json',
    indStr: string,
    silent = false
  ) => {
    setError(null);
    if (!text.trim()) {
      setOutput('');
      return;
    }
    const indentNum = parseInt(indStr, 10) || 2;
    if (dir === 'json-to-yaml') {
      const res = jsonToYaml(text, indentNum);
      if (res.error) {
        setError(res.error);
        notify('JSON 解析失败', res.error, 'danger');
      } else {
        setOutput(res.yaml);
        if (!silent) {
          notify('转换成功', undefined, 'success');
        }
      }
    } else {
      const res = yamlToJson(text, indentNum);
      if (res.error) {
        setError(res.error);
        notify('YAML 解析失败', res.error, 'danger');
      } else {
        setOutput(res.json);
        if (!silent) {
          notify('转换成功', undefined, 'success');
        }
      }
    }
  };

  const handleConvert = () => {
    doConvert(input, direction, indent, false);
  };

  const handleSwap = () => {
    const nextDir = direction === 'json-to-yaml' ? 'yaml-to-json' : 'json-to-yaml';
    setDirection(nextDir);
    setError(null);

    const curInput = input.trim();
    const curOutput = output.trim();
    const indentNum = parseInt(indent, 10) || 2;

    if (curOutput) {
      // Direct swap of sides: what was output becomes input, what was input becomes output
      setInput(output);
      setOutput(input);
      notify('已互换方向与内容', undefined, 'info');
    } else if (curInput) {
      // Output was empty: convert current input into target format so input matches new role
      if (direction === 'json-to-yaml') {
        const res = jsonToYaml(input, indentNum);
        if (res.error) {
          setError(`互换失败：当前输入不是有效 JSON（${res.error}）`);
          notify('互换失败', res.error, 'danger');
        } else {
          setInput(res.yaml);
          setOutput(input);
          notify('已互换方向与内容', undefined, 'info');
        }
      } else {
        const res = yamlToJson(input, indentNum);
        if (res.error) {
          setError(`互换失败：当前输入不是有效 YAML（${res.error}）`);
          notify('互换失败', res.error, 'danger');
        } else {
          setInput(res.json);
          setOutput(input);
          notify('已互换方向与内容', undefined, 'info');
        }
      }
    } else {
      notify('已切换转换方向', undefined, 'info');
    }
  };

  const handleIndentChange = (newIndent: string) => {
    setIndent(newIndent);
    if (input.trim()) {
      doConvert(input, direction, newIndent, true);
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
    const ext = direction === 'json-to-yaml' ? 'yaml' : 'json';
    const mime = direction === 'json-to-yaml' ? 'text/yaml' : 'application/json';
    downloadBlob(new Blob([output], { type: mime }), `converted.${ext}`);
  };

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 pt-4">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm font-semibold">JSON ↔ YAML 互转</CardTitle>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">缩进:</span>
          <Select
            size="sm"
            className="w-20"
            value={indent}
            onChange={handleIndentChange}
            options={[
              { value: '2', label: '2 空格' },
              { value: '4', label: '4 空格' },
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
              <span>输入 ({direction === 'json-to-yaml' ? 'JSON' : 'YAML'})</span>
              <span className="font-mono text-[11px]">{input.length} 字符</span>
            </div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={direction === 'json-to-yaml' ? '在此粘贴或输入 JSON…' : '在此粘贴或输入 YAML…'}
              className="h-96 w-full rounded-md border border-border bg-card p-3 font-mono text-xs leading-relaxed outline-none focus:ring-2 focus:ring-primary/30"
              spellCheck={false}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
              <span>输出 ({direction === 'json-to-yaml' ? 'YAML' : 'JSON'})</span>
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
