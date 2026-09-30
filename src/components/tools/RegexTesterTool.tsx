import { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/card';
import { testRegex } from '@/engine/dev-tools';
import { AlertCircle, Check, Copy } from 'lucide-react';

const COMMON_REGEX_PATTERNS = [
  { label: '常用预设…', value: '' },
  { label: '电子邮箱 (Email)', value: '^[\\w-\\.]+@([\\w-]+\\.)+[\\w-]{2,4}$' },
  { label: '中国大陆手机号 (11位)', value: '^1[3-9]\\d{9}$' },
  { label: 'URL 网址', value: 'https?:\\/\\/[\\w\\-\\.]+(\\:[0-9]+)?(\\S*)?' },
  { label: 'IPv4 地址', value: '^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$' },
  { label: '中文字符', value: '[\\u4e00-\\u9fa5]+' },
  { label: '18位身份证号', value: '^[1-9]\\d{5}(?:18|19|20)\\d{2}(?:0[1-9]|10|11|12)(?:0[1-9]|[1-2]\\d|30|31)\\d{3}[\\dXx]$' },
  { label: '日期 YYYY-MM-DD', value: '^\\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\\d|3[01])$' },
  { label: '十六进制颜色码 (#RGB/#RRGGBB)', value: '^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$' },
];

export function RegexTesterTool({ notify }: { notify: (title: string, desc?: string, type?: 'success' | 'danger') => void }) {
  const [pattern, setPattern] = useState<string>('(\\w+)@([\\w.-]+)\\.([a-z]{2,})');
  const [flags, setFlags] = useState<{ g: boolean; i: boolean; m: boolean; s: boolean; u: boolean }>({
    g: true,
    i: true,
    m: false,
    s: false,
    u: false,
  });
  const [testText, setTestText] = useState<string>(
    'Hello, contact support@company.com or sales-dept@my-shop.org for inquiries. You can also reach admin@cloud.io anytime.'
  );
  const [replaceMode, setReplaceMode] = useState(false);
  const [replacement, setReplacement] = useState<string>('masked_email');
  const [copied, setCopied] = useState(false);

  const flagString = useMemo(() => {
    return Object.entries(flags)
      .filter(([_, enabled]) => enabled)
      .map(([f]) => f)
      .join('');
  }, [flags]);

  const result = useMemo(() => {
    return testRegex(pattern, flagString, testText, replaceMode ? replacement : undefined);
  }, [pattern, flagString, testText, replaceMode, replacement]);

  const toggleFlag = (flag: keyof typeof flags) => {
    setFlags((prev) => ({ ...prev, [flag]: !prev[flag] }));
  };

  const handleCopyReplacement = () => {
    if (!result.replacedText) return;
    navigator.clipboard.writeText(result.replacedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    notify('已复制替换结果', undefined, 'success');
  };

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 pt-4">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm font-semibold">正则表达式实时测试器</CardTitle>
          <Badge variant="outline" className="text-[10px]">
            {result.error ? '语法错误' : `匹配到 ${result.matches.length} 处`}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Select
            size="sm"
            className="w-44"
            value=""
            onChange={(val) => {
              if (val) setPattern(val);
            }}
            options={COMMON_REGEX_PATTERNS}
            placeholder="插入常用预设…"
          />
          <Button
            variant={replaceMode ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setReplaceMode(!replaceMode)}
          >
            {replaceMode ? '关闭替换' : '开启文本替换'}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-5">
        {/* Pattern & Flags Bar */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex flex-1 items-center rounded-md border border-border bg-card px-2.5 shadow-xs focus-within:ring-2 focus-within:ring-primary/30">
              <span className="font-mono text-sm text-muted-foreground">/</span>
              <input
                type="text"
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                placeholder="在此输入正则表达式…"
                className="h-8 flex-1 bg-transparent px-1 font-mono text-xs text-foreground outline-none"
                spellCheck={false}
              />
              <span className="font-mono text-sm text-muted-foreground">/</span>
              <span className="ml-1 font-mono text-xs font-semibold text-primary">{flagString}</span>
            </div>

            {/* Flag Checkboxes */}
            <div className="flex items-center gap-1 rounded-md border border-border bg-muted/40 p-1 text-xs">
              {(['g', 'i', 'm', 's', 'u'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => toggleFlag(f)}
                  title={{
                    g: 'global: 全局匹配',
                    i: 'ignoreCase: 忽略大小写',
                    m: 'multiline: 多行模式',
                    s: 'dotAll: 点号匹配包括换行符',
                    u: 'unicode: 完整 Unicode 字符集',
                  }[f]}
                  className={`flex h-6 w-6 items-center justify-center rounded font-mono text-xs font-semibold transition-colors ${
                    flags[f] ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {result.error ? (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="font-mono">{result.error}</span>
            </div>
          ) : null}
        </div>

        {/* Replacement input if active */}
        {replaceMode ? (
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/20 p-2.5">
            <span className="text-xs font-semibold text-muted-foreground shrink-0">替换为:</span>
            <Input
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
              placeholder="替换字符串（支持 $1, $2, $& 等捕获组标记）…"
              className="h-7 text-xs"
            />
          </div>
        ) : null}

        {/* Text Area Input */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
            <span>测试文本 (Test String)</span>
            <span className="font-mono text-[11px]">{testText.length} 字符</span>
          </div>
          <textarea
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            placeholder="在此输入需要测试的文本…"
            className="h-44 w-full rounded-md border border-border bg-card p-3 font-mono text-xs leading-relaxed outline-none focus:ring-2 focus:ring-primary/30"
            spellCheck={false}
          />
        </div>

        {/* Replaced Text View (if active) */}
        {replaceMode && result.replacedText !== undefined ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
              <span>替换结果预览</span>
              <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs" onClick={handleCopyReplacement}>
                {copied ? <Check className="mr-1 h-3 w-3 text-green-600" /> : <Copy className="mr-1 h-3 w-3" />}
                {copied ? '已复制' : '复制结果'}
              </Button>
            </div>
            <textarea
              value={result.replacedText}
              readOnly
              className="h-28 w-full rounded-md border border-border bg-muted/20 p-3 font-mono text-xs leading-relaxed text-foreground outline-none"
              spellCheck={false}
            />
          </div>
        ) : null}

        {/* Match Table */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-foreground">
            <span>匹配清单 ({result.matches.length})</span>
          </div>

          {result.matches.length > 0 ? (
            <div className="max-h-60 overflow-auto rounded-lg border border-border bg-card text-xs shadow-xs">
              <table className="w-full text-left font-mono">
                <thead className="sticky top-0 border-b border-border bg-muted/60 text-[11px] text-muted-foreground">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">#</th>
                    <th className="px-3 py-1.5 font-medium">区间</th>
                    <th className="px-3 py-1.5 font-medium">匹配文本</th>
                    <th className="px-3 py-1.5 font-medium">捕获组 (Groups)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {result.matches.map((m, idx) => (
                    <tr key={idx} className="hover:bg-muted/30">
                      <td className="px-3 py-1.5 text-muted-foreground">{idx + 1}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        [{m.index}..{m.index + m.length}]
                      </td>
                      <td className="px-3 py-1.5 font-bold text-primary">{m.text}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {m.groups.length > 0
                          ? m.groups.map((g, gi) => (
                              <span
                                key={gi}
                                className="mr-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] text-foreground"
                              >
                                ${gi + 1}: {g}
                              </span>
                            ))
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-muted/10 p-4 text-center text-xs text-muted-foreground">
              未找到匹配项
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
