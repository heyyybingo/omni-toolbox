export type LayoutKind = 'l1' | 'l2' | 'l3' | 'l4' | 'l5' | 'l6' | 'l7';

export type ToolKind =
  | 'image'
  | 'image-resize'
  | 'image-watermark'
  | 'image-transform'
  | 'image-to-pdf'
  | 'pdf-merge'
  | 'pdf-split'
  | 'pdf-delete'
  | 'pdf-numbers'
  | 'pdf-to-images'
  | 'pdf-text'
  | 'pdf-reorder'
  | 'pdf-nup'
  | 'pdf-crop'
  | 'pdf-img-wm'
  | 'pdf-encrypt'
  | 'image-crop'
  | 'image-stitch'
  | 'image-stamp'
  | 'pdf-searchable'
  | 'ocr-id'
  | 'video-cover'
  | 'video-gif'
  | 'video-audio'
  | 'video-trim'
  | 'pdf-form'
  | 'pdf-outlines'
  | 'pdf-hf'
  | 'pdf-decrypt'
  | 'pdf'
  | 'audio'
  | 'audio-trim'
  | 'json'
  | 'json-csv'
  | 'ocr'
  | 'base64'
  | 'hash'
  | 'uuid'
  | 'timestamp'
  | 'color'
  | 'jwt'
  | 'qr'
  | 'json-yaml'
  | 'json-to-ts'
  | 'text-diff'
  | 'regex-tester'
  | 'favicon-gen'
  | 'image-exif-view';

export interface ToolDef {
  id: string;
  group: string;
  title: string;
  desc: string;
  layout: LayoutKind;
  accept: string;
  kind: ToolKind;
  hasInspector?: 'image-compare' | 'pdf-page';
  /** extra search keywords (aliases) */
  keywords?: string;
}

export const TOOLS: Record<string, ToolDef> = {
  'image-convert': {
    id: 'image-convert',
    group: '图片',
    title: '图片格式转换',
    desc: 'JPG / PNG / WebP 互转。',
    layout: 'l1',
    accept: 'image/*',
    kind: 'image',
  },
  'image-compress': {
    id: 'image-compress',
    group: '图片',
    title: '图片压缩',
    desc: '质量与最大边长，批量减小体积。',
    layout: 'l1',
    accept: 'image/*',
    kind: 'image',
    hasInspector: 'image-compare',
    keywords: 'compress reduce size 压缩 体积 变小',
  },
  'image-exif': {
    id: 'image-exif',
    group: '图片',
    title: '清除 EXIF',
    desc: '去掉拍摄设备与位置元数据。',
    layout: 'l1',
    accept: 'image/*',
    kind: 'image',
  },
  'image-to-pdf': {
    id: 'image-to-pdf',
    group: '图片',
    title: '图片转 PDF',
    desc: '多图按序合成一个 PDF。',
    layout: 'l3',
    accept: 'image/*',
    kind: 'image-to-pdf',
  },
  'pdf-merge': {
    id: 'pdf-merge',
    group: 'PDF',
    title: 'PDF 拼接',
    desc: '按列表顺序合并。',
    layout: 'l1',
    accept: 'application/pdf,.pdf',
    kind: 'pdf-merge',
  },
  'pdf-split': {
    id: 'pdf-split',
    group: 'PDF',
    title: 'PDF 拆分',
    desc: '按页码提取，如 1-3,5。',
    layout: 'l1',
    accept: 'application/pdf,.pdf',
    kind: 'pdf-split',
  },
  'pdf-rotate': {
    id: 'pdf-rotate',
    group: 'PDF',
    title: 'PDF 旋转',
    desc: '整份旋转 90/180/270。',
    layout: 'l2',
    accept: 'application/pdf,.pdf',
    kind: 'pdf',
    hasInspector: 'pdf-page',
  },
  'pdf-watermark': {
    id: 'pdf-watermark',
    group: 'PDF',
    title: 'PDF 水印',
    desc: '文字水印，可调字号与透明度。',
    layout: 'l2',
    accept: 'application/pdf,.pdf',
    kind: 'pdf',
    hasInspector: 'pdf-page',
    keywords: 'watermark mark stamp 防伪 保密',
  },
  'audio-convert': {
    id: 'audio-convert',
    group: '音频',
    title: '音频转换',
    desc: '解码后导出 WAV。',
    layout: 'l1',
    accept: 'audio/*',
    kind: 'audio',
  },
  'json-format': {
    id: 'json-format',
    group: '数据',
    title: 'JSON 格式化',
    desc: '格式化、压缩、校验 JSON。',
    layout: 'l4',
    accept: 'application/json,.json,.txt',
    kind: 'json',
  },
  'image-resize': {
    id: 'image-resize',
    group: '图片',
    title: '图片缩放',
    desc: '按宽高或比例缩放，批量输出。',
    layout: 'l1',
    accept: 'image/*',
    kind: 'image-resize',
    hasInspector: 'image-compare',
  },
  'image-watermark': {
    id: 'image-watermark',
    group: '图片',
    title: '图片水印',
    desc: '文字水印，可调位置与透明度。',
    layout: 'l1',
    accept: 'image/*',
    kind: 'image-watermark',
    hasInspector: 'image-compare',
  },
  'pdf-delete': {
    id: 'pdf-delete',
    group: 'PDF',
    title: 'PDF 删页',
    desc: '删除指定页，例如 2,4-5。',
    layout: 'l1',
    accept: 'application/pdf,.pdf',
    kind: 'pdf-delete',
  },
  'pdf-numbers': {
    id: 'pdf-numbers',
    group: 'PDF',
    title: 'PDF 页码',
    desc: '添加页脚/页眉页码。',
    layout: 'l1',
    accept: 'application/pdf,.pdf',
    kind: 'pdf-numbers',
  },
  'pdf-to-images': {
    id: 'pdf-to-images',
    group: 'PDF',
    title: 'PDF 转图片',
    desc: '每页导出 PNG。',
    layout: 'l1',
    accept: 'application/pdf,.pdf',
    kind: 'pdf-to-images',
    hasInspector: 'pdf-page',
  },
  'base64': {
    id: 'base64',
    group: '开发',
    title: 'Base64',
    desc: '文本 Base64 编码/解码。',
    layout: 'l4',
    accept: '.txt',
    kind: 'base64',
  },
  'hash': {
    id: 'hash',
    group: '开发',
    title: '哈希',
    desc: 'SHA-1/256/512 摘要。',
    layout: 'l4',
    accept: '*',
    kind: 'hash',
  },
  'uuid': {
    id: 'uuid',
    group: '开发',
    title: 'UUID',
    desc: '生成 UUID v4。',
    layout: 'l4',
    accept: '*',
    kind: 'uuid',
  },
  'image-transform': {
    id: 'image-transform',
    group: '图片',
    title: '旋转 / 翻转',
    desc: '90° 旋转与水平/垂直翻转。',
    layout: 'l1',
    accept: 'image/*',
    kind: 'image-transform',
    hasInspector: 'image-compare',
  },
  'pdf-text': {
    id: 'pdf-text',
    group: 'PDF',
    title: 'PDF 提取文本',
    desc: '导出可复制的纯文本。',
    layout: 'l1',
    accept: 'application/pdf,.pdf',
    kind: 'pdf-text',
    hasInspector: 'pdf-page',
  },
  'audio-trim': {
    id: 'audio-trim',
    group: '音频',
    title: '音频裁剪',
    desc: '按时间截取片段导出 WAV/MP3。',
    layout: 'l1',
    accept: 'audio/*',
    kind: 'audio-trim',
  },
  'json-csv': {
    id: 'json-csv',
    group: '数据',
    title: 'JSON ↔ CSV',
    desc: '表格数据互转。',
    layout: 'l4',
    accept: '.json,.csv,.txt',
    kind: 'json-csv',
  },
  'timestamp': {
    id: 'timestamp',
    group: '开发',
    title: '时间戳',
    desc: 'Unix 秒/毫秒与日期互转。',
    layout: 'l4',
    accept: '*',
    kind: 'timestamp',
  },
  'color': {
    id: 'color',
    group: '开发',
    title: '颜色转换',
    desc: 'HEX / RGB / HSL。',
    layout: 'l4',
    accept: '*',
    kind: 'color',
  },
  'jwt': {
    id: 'jwt',
    group: '开发',
    title: 'JWT 解码',
    desc: '查看 header / payload（不验签）。',
    layout: 'l4',
    accept: '*',
    kind: 'jwt',
  },
  'qr': {
    id: 'qr',
    group: '开发',
    title: '二维码',
    desc: '文本生成二维码图片。',
    layout: 'l4',
    accept: '*',
    kind: 'qr',
  },
  'ocr': {
    id: 'ocr',
    group: '文档',
    title: 'OCR 提取文字',
    desc: '图片/PDF 识别为可复制文本。',
    layout: 'l1',
    accept: 'image/*,application/pdf,.pdf',
    kind: 'ocr',
    hasInspector: 'image-compare',
  },
  'pdf-reorder': {
    id: 'pdf-reorder',
    group: 'PDF',
    title: 'PDF 页序',
    desc: '按指定顺序重排页面。',
    layout: 'l1',
    accept: 'application/pdf,.pdf',
    kind: 'pdf-reorder',
  },
  'pdf-nup': {
    id: 'pdf-nup',
    group: 'PDF',
    title: 'PDF 多页合一',
    desc: '2 合 1 / 4 合 1 拼版。',
    layout: 'l1',
    accept: 'application/pdf,.pdf',
    kind: 'pdf-nup',
  },
  'pdf-crop': {
    id: 'pdf-crop',
    group: 'PDF',
    title: 'PDF 页面裁剪',
    desc: '按边距裁切所有页面。',
    layout: 'l1',
    accept: 'application/pdf,.pdf',
    kind: 'pdf-crop',
  },
  'image-crop': {
    id: 'image-crop',
    group: '图片',
    title: '图片裁剪',
    desc: '按坐标与宽高裁剪。',
    layout: 'l1',
    accept: 'image/*',
    kind: 'image-crop',
    hasInspector: 'image-compare',
  },
  'pdf-img-wm': {
    id: 'pdf-img-wm',
    group: 'PDF',
    title: 'PDF 图片水印',
    desc: 'Logo/印章图铺在每页上。',
    layout: 'l1',
    accept: 'application/pdf,.pdf',
    kind: 'pdf-img-wm',
    hasInspector: 'pdf-page',
  },
  'pdf-encrypt': {
    id: 'pdf-encrypt',
    group: 'PDF',
    title: 'PDF 加密',
    desc: '设置打开密码；权限密码用于限制修改类操作。',
    layout: 'l1',
    accept: 'application/pdf,.pdf',
    kind: 'pdf-encrypt',
  },
  'image-stitch': {
    id: 'image-stitch',
    group: '图片',
    title: '长图拼接',
    desc: '多张图横向/纵向拼成一张。',
    layout: 'l3',
    accept: 'image/*',
    kind: 'image-stitch',
    hasInspector: 'image-compare',
  },
  'image-stamp': {
    id: 'image-stamp',
    group: '图片',
    title: '图片 Logo 水印',
    desc: 'Logo/印章叠加到图片上。',
    layout: 'l1',
    accept: 'image/*',
    kind: 'image-stamp',
    hasInspector: 'image-compare',
  },
  'pdf-searchable': {
    id: 'pdf-searchable',
    group: '文档',
    title: '可搜索 PDF',
    desc: '扫描件/图片 PDF 加文字层。',
    layout: 'l1',
    accept: 'application/pdf,.pdf',
    kind: 'pdf-searchable',
    hasInspector: 'pdf-page',
  },
  'ocr-id': {
    id: 'ocr-id',
    group: '文档',
    title: '证件 OCR',
    desc: '识别身份证/银行卡/护照字段。',
    layout: 'l6',
    accept: 'image/*,application/pdf,.pdf',
    kind: 'ocr-id',
    hasInspector: 'image-compare',
  },
  'video-cover': {
    id: 'video-cover',
    group: '视频',
    title: '视频封面',
    desc: '截取指定时间点画面为 JPG。',
    layout: 'l1',
    accept: 'video/*',
    kind: 'video-cover',
    hasInspector: 'image-compare',
  },
  'video-gif': {
    id: 'video-gif',
    group: '视频',
    title: '视频转 GIF',
    desc: '截取片段导出 GIF。',
    layout: 'l1',
    accept: 'video/*',
    kind: 'video-gif',
  },
  'video-audio': {
    id: 'video-audio',
    group: '视频',
    title: '提取音轨',
    desc: '导出视频里的声音。',
    layout: 'l1',
    accept: 'video/*',
    kind: 'video-audio',
  },
  'video-trim': {
    id: 'video-trim',
    group: '视频',
    title: '视频裁剪',
    desc: '时间轴选段导出 WebM。',
    layout: 'l1',
    accept: 'video/*',
    kind: 'video-trim',
  },
  'pdf-outlines': {
    id: 'pdf-outlines',
    group: 'PDF',
    title: '书签目录',
    desc: '为 PDF 写入可跳转书签（Outline）。',
    layout: 'l1',
    accept: 'application/pdf,.pdf',
    kind: 'pdf-outlines',
  },
  'pdf-form': {
    id: 'pdf-form',
    group: 'PDF',
    title: '表单填写',
    desc: '按字段名填入文本。',
    layout: 'l1',
    accept: 'application/pdf,.pdf',
    kind: 'pdf-form',
  },
  'pdf-hf': {
    id: 'pdf-hf',
    group: 'PDF',
    title: '页眉页脚',
    desc: '添加页眉/页脚文字（可含页码）。',
    layout: 'l1',
    accept: 'application/pdf,.pdf',
    kind: 'pdf-hf',
  },
  'pdf-decrypt': {
    id: 'pdf-decrypt',
    group: 'PDF',
    title: 'PDF 解密',
    desc: '已知密码时解锁并另存。',
    layout: 'l1',
    accept: 'application/pdf,.pdf',
    kind: 'pdf-decrypt',
    hasInspector: 'pdf-page',
  },
  'json-yaml': {
    id: 'json-yaml',
    group: '数据',
    title: 'JSON ↔ YAML',
    desc: 'JSON 与 YAML 格式双向互转与语法校验。',
    layout: 'l4',
    accept: 'text/yaml,application/json,.yaml,.yml,.json',
    kind: 'json-yaml',
    keywords: 'yaml yml json convert 配置文件 格式转换',
  },
  'json-to-ts': {
    id: 'json-to-ts',
    group: '开发',
    title: 'JSON 转 TypeScript',
    desc: '根据 JSON 自动推导并生成 TS interface 与类型声明。',
    layout: 'l4',
    accept: 'application/json,.json',
    kind: 'json-to-ts',
    keywords: 'ts typescript interface type 类型声明 实体生成',
  },
  'text-diff': {
    id: 'text-diff',
    group: '开发',
    title: '文本 / JSON 对比',
    desc: '逐行/逐词对比两份文本或 JSON 差异。',
    layout: 'l4',
    accept: 'text/*,.json,.txt,.md',
    kind: 'text-diff',
    keywords: 'diff compare 对比 差异 比较 patch 代码比对',
  },
  'regex-tester': {
    id: 'regex-tester',
    group: '开发',
    title: '正则表达式测试',
    desc: '实时正则匹配高亮、捕获组分析与文本替换。',
    layout: 'l4',
    accept: 'text/*',
    kind: 'regex-tester',
    keywords: 'regex regexp 正则 表达式 匹配 替换 提取',
  },
  'favicon-gen': {
    id: 'favicon-gen',
    group: '图片',
    title: 'Favicon / 应用图标生成',
    desc: '一键生成 Web/iOS/Android 全套尺寸图标与 ICO 包。',
    layout: 'l1',
    accept: 'image/*',
    kind: 'favicon-gen',
    keywords: 'favicon icon 网站图标 图标包 app 16 32 180 512 ico manifest',
  },
  'image-exif-view': {
    id: 'image-exif-view',
    group: '图片',
    title: 'EXIF 参数检视',
    desc: '查看相机、镜头、快门、ISO、焦距与 GPS 地图等元数据。',
    layout: 'l1',
    accept: 'image/jpeg,image/tiff,image/webp,image/png,image/heic',
    kind: 'image-exif-view',
    keywords: 'exif 元数据 metadata 相机 快门 iso gps 拍摄参数 曝光',
  },
};

export function groupTools() {
  const map: Record<string, ToolDef[]> = {};
  for (const tool of Object.values(TOOLS)) {
    (map[tool.group] ||= []).push(tool);
  }
  return map;
}

export function layoutLabel(layout: LayoutKind) {
  return {
    l1: '批量流水线',
    l2: '视觉校准',
    l3: '页面编排',
    l4: '文本工作台',
    l5: '文档编排',
    l6: '字段表单',
    l7: '时间轴',
  }[layout];
}
