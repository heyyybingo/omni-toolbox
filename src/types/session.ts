import type { JobResult } from '@/engine/jobs';
import type { parseJsonSafe } from '@/lib/utils';

export type JsonParsed = ReturnType<typeof parseJsonSafe>;

export type ToolSession = {
  toolId: string;
  files: File[];
  results: JobResult[];
  quality: number;
  format: string;
  maxEdge: number;
  outName: string;
  pageRange: string;
  angle: number;
  wmText: string;
  wmSize: number;
  wmOpacity: number;
  wmAngle: number;
  wmColor: string;
  wmBold: boolean;
  wmMode: 'single' | 'tile';
  wmGapX: number;
  wmGapY: number;
  audioFormat: 'wav' | 'mp3' | 'flac';
  audioSampleRate: number;
  audioChannels: 'source' | 'mono' | 'stereo';
  audioBitDepth: 16 | 24 | 32;
  audioMp3Kbps: number;
  jsonText: string;
  jsonOut: string;
  jsonOk: boolean;
  jsonView: 'tree' | 'text';
  jsonParsed: JsonParsed | null;
  // extended params
  resizeW: number;
  resizeH: number;
  resizeKeepAspect: boolean;
  imgWmText: string;
  imgWmPos: 'center' | 'bottom-right' | 'tile';
  imgWmOpacity: number;
  deleteRange: string;
  pageNumFormat: string;
  pageNumStart: number;
  pageNumPos: 'footer' | 'header';
  pdfImageScale: number;
  textSource: string;
  rot: number;
  flipH: boolean;
  flipV: boolean;
  trimStart: number;
  trimEnd: number;
  jwtText: string;
  colorText: string;
  qrText: string;
  tsValue: string;
  targetKb: number;
  ocrLang: string;
  pageOrder: string;
  nup: 2 | 4;
  crop: { x: number; y: number; w: number; h: number; top: number; right: number; bottom: number; left: number };
  userPassword: string;
  ownerPassword: string;
  stampFile: File | null;
  stampScale: number;
  encryptPerms: {
    printing: boolean;
    copying: boolean;
    modifying: boolean;
    annotating: boolean;
    fillingForms: boolean;
    assembling: boolean;
    accessibility: boolean;
  };
  jobStatus: Record<number, 'pending' | 'running' | 'done' | 'failed'>;
  jobErrors: Record<number, string>;
  failedJobs: { index: number; name: string }[];
  stitchDir: 'v' | 'h';
  stitchGap: number;
  headerText: string;
  footerText: string;
  brightness: number;
  contrast: number;
  saturate: number;
  decryptPassword: string;
  wmPos: 'center' | 'tl' | 'tr' | 'bl' | 'br' | 'tile';
  formJson: string;
  tocLines: string;
  videoTime: number;
  gifStart: number;
  gifEnd: number;
  gifWidth: number;
};

export function createSession(toolId: string): ToolSession {
  return {
    toolId,
    files: [],
    results: [],
    quality: 80,
    format: 'image/webp',
    maxEdge: 0,
    outName: 'merged.pdf',
    pageRange: '1-',
    angle: 90,
    wmText: '仅供预览',
    wmSize: 42,
    wmOpacity: 18,
    wmAngle: 32,
    wmColor: '#333a48',
    wmBold: true,
    wmMode: 'single',
    wmGapX: 280,
    wmGapY: 180,
    audioFormat: 'wav',
    audioSampleRate: 0,
    audioChannels: 'source',
    audioBitDepth: 16,
    audioMp3Kbps: 192,
    jsonText: '',
    jsonOut: '',
    jsonOk: true,
    jsonView: 'tree',
    jsonParsed: null,
    resizeW: 1024,
    resizeH: 0,
    resizeKeepAspect: true,
    imgWmText: '©',
    imgWmPos: 'center',
    imgWmOpacity: 25,
    deleteRange: '',
    pageNumFormat: '{n} / {total}',
    pageNumStart: 1,
    pageNumPos: 'footer',
    pdfImageScale: 1.5,
    textSource: '',
    rot: 90,
    flipH: false,
    flipV: false,
    trimStart: 0,
    trimEnd: 0,
    jwtText: '',
    colorText: '#0C66E4',
    qrText: 'https://example.com',
    tsValue: '',
    targetKb: 200,
    ocrLang: 'eng',
    pageOrder: '1-',
    nup: 2,
    crop: { x: 0, y: 0, w: 800, h: 600, top: 24, right: 24, bottom: 24, left: 24 },
    userPassword: '',
    ownerPassword: '',
    stampFile: null,
    stampScale: 0.2,
    encryptPerms: {
      printing: true,
      copying: true,
      modifying: false,
      annotating: true,
      fillingForms: true,
      assembling: false,
      accessibility: true,
    },
    jobStatus: {},
    jobErrors: {},
    failedJobs: [],
    stitchDir: 'v',
    stitchGap: 0,
    headerText: '',
    footerText: '{n} / {total}',
    brightness: 100,
    contrast: 100,
    saturate: 100,
    decryptPassword: '',
    wmPos: 'center',
    formJson: '{}',
    tocLines: '',
    videoTime: 1,
    gifStart: 0,
    gifEnd: 5,
    gifWidth: 480,
  };
}
