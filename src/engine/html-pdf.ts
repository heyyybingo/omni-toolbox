import dompdf from 'dompdf.js';
import type { JobResult } from './jobs';
import { baseName } from '@/lib/utils';

export type HtmlPdfOptions = {
  format?: 'a4' | 'letter' | 'a3' | 'a5';
  pagination?: boolean;
  filename?: string;
};

/**
 * DOM → vector PDF via dompdf.js (WASM): selectable text, pagination, CJK-safe.
 * Renders HTML in an off-screen container using browser layout, then exports.
 */
export async function processHtmlToPdf(
  html: string,
  options: HtmlPdfOptions = {}
): Promise<JobResult> {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = [
    'position:fixed',
    'left:-10000px',
    'top:0',
    'width:794px', // ~A4 @96dpi
    'background:#fff',
    'color:#111',
    'font-family:Inter,"PingFang SC","Microsoft YaHei",sans-serif',
    'padding:40px',
    'box-sizing:border-box',
  ].join(';');

  host.innerHTML = `
    <style>
      .doc-root { font-size: 14px; line-height: 1.6; color: #111; }
      .doc-root h1 { font-size: 28px; margin: 0 0 12px; }
      .doc-root h2 { font-size: 22px; margin: 20px 0 8px; }
      .doc-root h3 { font-size: 18px; margin: 16px 0 8px; }
      .doc-root p { margin: 0 0 10px; }
      .doc-root ul, .doc-root ol { margin: 0 0 10px 20px; }
      .doc-root li { margin: 4px 0; }
      .doc-root code {
        font-family: "JetBrains Mono", ui-monospace, monospace;
        background: #f1f2f4; padding: 1px 5px; border-radius: 4px; font-size: 12px;
      }
      .doc-root pre {
        background: #f1f2f4; padding: 12px; border-radius: 8px;
        overflow: auto; font-size: 12px; line-height: 1.5;
      }
      .doc-root blockquote {
        border-left: 3px solid #c7d2fe; margin: 12px 0; padding: 4px 12px; color: #44546f;
      }
      .doc-root table { border-collapse: collapse; width: 100%; margin: 12px 0; }
      .doc-root th, .doc-root td { border: 1px solid #d0d0d8; padding: 6px 8px; font-size: 13px; }
      .doc-root th { background: #f7f7f8; text-align: left; }
      .doc-root hr { border: 0; border-top: 1px solid #e6e6ea; margin: 16px 0; }
      .doc-root a { color: #0c66e4; text-decoration: underline; }
      .doc-root img { max-width: 100%; height: auto; }
    </style>
    <div class="doc-root" id="dompdf-root"></div>
  `;

  const root = host.querySelector<HTMLElement>('#dompdf-root');
  if (!root) throw new Error('无法创建渲染容器');

  // Prefer trusting HTML structure; escape is not applied so user gets full HTML control.
  root.innerHTML = html;

  document.body.appendChild(host);
  try {
    const blob = await dompdf(root, {
      format: options.format || 'a4',
      pagination: options.pagination !== false,
      backgroundColor: '#ffffff',
    });

    return {
      name: options.filename || `${baseName('document')}.pdf`,
      blob,
      size: blob.size,
      inputSize: html.length,
      note: '文字层',
    };
  } finally {
    host.remove();
  }
}

export const DEFAULT_HTML_SAMPLE = `<h1>产品说明书</h1>
<p>这是通过 <strong>DOM → PDF</strong> 导出的文档，文字可选中、可搜索。</p>
<h2>特性</h2>
<ul>
  <li>标题、段落、<em>强调</em>、<code>代码</code></li>
  <li>列表、表格、引用</li>
  <li>分页与页边距由浏览器布局决定</li>
</ul>
<blockquote>对齐 dompdf 一类能力：结构化 HTML 写作，而不是纯文本贴进 PDF。</blockquote>
<table>
  <tr><th>格式</th><th>说明</th></tr>
  <tr><td>A4</td><td>默认纸张</td></tr>
  <tr><td>Letter</td><td>可选</td></tr>
</table>
<h3>示例代码</h3>
<pre><code>const blob = await exportPDF(el, { format: 'a4', pagination: true });</code></pre>
<p>来源：粘贴 HTML 或用编辑器写出结构化内容。</p>
`;
