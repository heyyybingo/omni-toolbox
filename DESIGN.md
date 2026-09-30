# Local Toolbox — Design Spec

纯前端、完全免费开源的文件工具箱。专门覆盖「别人收费、其实浏览器就能做」的场景。

## Product

- **Name**: Toolbox / 文件工具
- **Positioning**: Browser file utilities (convert, compress, merge, audio export)
- **UI voice**: Functional labels only — no 本地 / 免费 / 上传 / 开源 marketing copy
- **Platform**: React 18 + Vite + TypeScript + Tailwind CSS + shadcn-style UI
- **Structure**: `src/components/ui`, `src/engine`, `src/workers` (module workers), `src/tools/registry.ts`

## Style Anchor

Linear / Notion workbench (not marketing chrome):
single-tool focus, strong type hierarchy, quiet chrome, soft surfaces.

## Palette

| Role | Hex | Use |
|---|---|---|
| Canvas | `#F7F8F9` | App background |
| Surface | `#FFFFFF` | Cards, panels, tables |
| Surface sunken | `#F1F2F4` | Dropzone idle, code/drop wells |
| Ink | `#172B4D` | Headings, primary text |
| Ink subtle | `#44546F` | Secondary text, labels |
| Ink subdued | `#626F86` | Meta, captions |
| Border | `#DFE1E6` / `#091E4224` | Dividers, card edges |
| Brand | `#0C66E4` | Primary buttons, links, selection |
| Brand hover | `#0055CC` | Hover |
| Brand subtle bg | `#E9F2FF` | Selected nav, soft brand fills |
| Success | `#22A06B` | Done states |
| Warning | `#E2B203` | Warnings |
| Danger | `#C9372C` | Errors, destructive |
| Discovery | `#6E5DC6` | "Pro tools elsewhere" tags — informational only |

## Typography

- **UI stack**: `"Inter", -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`
- **Mono**: `"JetBrains Mono", "SF Mono", ui-monospace, monospace` (file names, sizes, formats)
- **Scale** (Atlassian-aligned, 14px body):
  - Page title: 20–24px / bold
  - Section: 16px / bold
  - Body: 14px / 400, line-height 20px
  - Small: 12px / meta
  - Metric: 24px bold (before/after file size)

## Layout System

- 8px spacing base (`space.100 = 8px`)
- Shell: top bar 56px + left nav 240px + main workbench + optional right task tray
- Cards: 8px radius, 1px border, no heavy shadows (elevation only on overlays)
- Buttons: 3–4px radius (Atlassian-ish), 32px height default
- Max content width in workbench: 960px centered when single-tool focused

### Structure

```
┌──────────────────────────────────────────────┐
│ Logo   Search ⌘K              GitHub  Theme   │
├──────────┬───────────────────────────────────┤
│ Tools    │  Breadcrumb / Tool title           │
│          │  ┌─────────────────────────────┐  │
│ Image    │  │ Dropzone / File list        │  │
│  Convert │  │                             │  │
│  Compress│  │  Options (format, quality)  │  │
│  EXIF    │  │  [Run]                      │  │
│ PDF      │  └─────────────────────────────┘  │
│  Merge   │  Task queue / results             │
│  Split   │                                   │
│  Rotate  │                                   │
│  Watermark│                                  │
│ Audio    │                                   │
│  Convert │                                   │
│ Dev      │                                   │
└──────────┴───────────────────────────────────┘
```

## Signature Moments

1. **Smart Dropzone** — drag files in; type is detected; suggested tool chips appear (Image → Convert/Compress, PDF → Merge, Audio → Convert).
2. **Task Tray** — batch jobs with live progress from a Worker pool, original vs output size delta, one-click ZIP download.

## Feature Scope (MVP, all free)

| Tool | What it does | Engine |
|---|---|---|
| Image Convert | PNG/JPEG/WebP mutual convert + quality | OffscreenCanvas in Worker |
| Image Compress | quality + max edge, show savings | Worker |
| Image → PDF | pack images into a PDF | pdf-lib (Worker) |
| PDF Merge | concat multiple PDFs | pdf-lib (Worker) |
| PDF Split | extract page range | pdf-lib (Worker) |
| PDF Rotate | rotate pages | pdf-lib (Worker) |
| PDF Watermark | text watermark | pdf-lib (Worker) |
| Audio Convert | decode → WAV (and MP3 when available) | Web Audio (async main/worker) |
| Batch | unlimited files, parallel via pool | WorkerPool |

### Explicitly out of MVP
- Accounts, cloud, payments
- OCR, video, HEIC (later, still free)
- DRM/copyright circumvention

## Interaction Matrix

Layout is driven by **how the user judges the result**, not by media type.

| Pattern | When to use | Tools in MVP |
|---|---|---|
| **Batch** | 同一参数扫很多文件；产出正确即可，几乎无需盯图 | 图片转 PDF · 清 EXIF · PDF 拼接 · PDF 拆分 · 音频转换 |
| **Hybrid（校准 → 批量）** | 有损参数（质量/压缩）必须先看画质，但最终要批量处理 | 图片压缩 · 图片转换 |
| **Editor / Live preview** | 参数变化必须先「看见」；单文件沉浸调节 | PDF 水印 · PDF 旋转 |

### Hybrid pattern（压缩/转换）
批处理无法逐张预览，采用 **「样本校准 → 全部应用」**：

1. 拖入多份文件 → 列表/ chips  
2. 选中 1 张作 **校准样本**  
3. 左：原图 vs 效果图 **A/B 对比滑杆**（真实重编码）  
4. 侧栏：质量、最大边长、**样本体积估算**（原 → 新、节省%）  
5. 调好后一键对 **全部 N 个文件** 执行（Worker 并行）

原则：预览服务「参数决策」，批量服务「交付」；不强迫用户逐张确认。

### Selection rule
1. 结果是否强依赖「看起来对不对」？  
   - 视觉参数（水印/旋转）→ Editor  
   - 有损质量参数但目标是批量 → **Hybrid**  
   - 纯结构/格式产出 → Batch
2. Export always goes to WorkerPool, regardless of layout.

### Editor tools — live preview behavior
- **PDF 水印**: 渲染 PDF 首页位图，文字/字号/透明度/角度变更即时叠绘（不重跑 worker）
- **PDF 旋转**: 首页预览随角度实时旋转

### Future patterns
- **Page strip**: PDF 拆分/插页 — 缩略图多选页
- **Waveform**: 音频剪辑
- **Compare 独立工具**: 压缩前后 A/B

## MVP Scope

MVP = 当前 9 个工具的**最小可用实现**（能完成主路径），**不等于**全功能系统。

| 系统功能 | MVP | 说明 |
|---|---|---|
| 图片转换 | ✅ | Hybrid：样本 A/B + 批量 |
| 图片压缩 | ✅ | Hybrid：质量校准 + 批量 |
| 图片转 PDF | ✅ | 顺序合成为单 PDF |
| 清除 EXIF | ✅ | 重编码 |
| PDF 拼接 | ✅ | 列表顺序合并 |
| PDF 拆分 | ✅ | 页码范围提取 |
| PDF 旋转 | ✅ | 整份 + 实时预览 |
| PDF 水印 | ✅ | 文字水印 + 实时预览 |
| 音频 → WAV | ✅ | PCM |
| 批量并发 Worker | ✅ | 池 + Transferable |
| 打包 ZIP 下载 | ✅ | 多结果 |
| 主题切换 | ✅ | 浅/深 |
| 图片水印 | ❌ | 规划中 |
| PDF 压缩/抽页插页 | ❌ | 规划中 |
| HEIC / 视频 / OCR / MP3 | ❌ | 需重型 WASM 或后续模块 |
| 任务历史 | ❌ | 规划中 |

## Performance Architecture

```
Main thread (UI, live preview, queue)
    │ postMessage(ArrayBuffer, transfer)
    ▼
WorkerPool (size = hardwareConcurrency, max 4)
    ├── image-worker  (createImageBitmap + OffscreenCanvas)
    └── pdf-worker    (pdf-lib)
```

- Transferables for ArrayBuffers (zero-copy)
- One job per worker; FIFO queue with concurrency limit
- Live preview stays on main thread (pdf.js / Canvas), export goes to workers
- Graceful fallback if OffscreenCanvas unavailable

## Content Voice

Simplified Chinese UI. Direct and task-focused:
「拖入文件，或点击选择」「开始处理」「下载」— function names only, no sales or privacy slogans.

## Do / Don't

- DO: whitespace, alignment, hierarchy first; borders second; shadow last
- DO: show before/after size as metric
- DON'T: card-in-card, neon gradients, fake pricing walls
- DON'T: claim server-side quality for OCR/video
